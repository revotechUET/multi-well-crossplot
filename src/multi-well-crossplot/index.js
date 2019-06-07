var componentName = 'multiWellCrossplot';
module.exports.name = componentName;
require('./style.less');

const _DECIMAL_LEN = 4;

var app = angular.module(componentName, [
    'sideBar', 'wiTreeView', 'wiTableView',
    'wiApi', 'editable', 'wiDialog',
    'wiDroppable', 'wiDropdownList','plot-toolkit','wiLoading'
]);
app.component(componentName, {
    template: require('./template.html'),
    controller: multiWellCrossplotController,
    controllerAs: 'self',
    bindings: {
        token: "<",
        idProject: "<",
        wellSpec: "<",
        zonesetName: "<",
        selectionType: "<",
        selectionValue: "<",
		idHistogram: "<",
		config: '<'
    },
    transclude: true
});

function multiWellCrossplotController($scope, $timeout, $element, wiToken, wiApi, wiDialog, wiLoading) {
    let self = this;
    self.treeConfig = [];
    self.selectedNode = null;
    self.datasets = {};
    self.statisticHeaders = ['top','bottom','#pts','avg','min', 'max', 'avgdev', 'stddev', 'var', 'skew', 'kurtosis', 'median', 'p10', 'p50', 'p90'];
    self.statisticHeaderMasks = [true,true,true,true,true,true,true,true,true,true,true,true,true,true,true];
    //--------------
    $scope.tab = 1;
    self.selectionTab = self.selectionTab || 'Wells';

    $scope.setTab = function(newTab){
      $scope.tab = newTab;
    };

    $scope.isSet = function(tabNum){
      return $scope.tab === tabNum;
    };

    //--------------
    this.getDataset = function(well) {
        wiApi.getCachedWellPromise(well.idWell).then((well) => {
            self.datasets[well] = well.datasets;
        }).catch(e => console.error(e));
    }
    
    function getCurvesInWell(well) {
        let curves = [];
        well.datasets.forEach(dataset => {
            curves.push(...dataset.curves);
        });
        return curves;
    }

    function getFamilyInWell(well) {
        let curves = getCurvesInWell(well);
        let familyList = curves.map(c => wiApi.getFamily(c.idFamily));
        return familyList;
    }
    this.$onInit = function () {
        if (self.token)
            wiToken.setToken(self.token);
        $timeout(() => {
            $scope.$watch(() => (self.wellSpec.map(wsp => wsp.idWell)), () => {
                getTree();
            }, true);
            $scope.$watch(() => (self.selectionType), () => {
                getSelectionList(self.selectionType, self.treeConfig);
                updateDefaultConfig();
            });
            $scope.$watch(() => (self.selectionValue), () => {
                updateDefaultConfig();
            });
            $scope.$watch(() => (self.treeConfig.map(w => w.idWell)), () => {
                getSelectionList(self.selectionType, self.treeConfig);
                getZonesetsFromWells(self.treeConfig);
                updateDefaultConfig();
            }, true);
            // $scope.$watch(() => (
            //     `${self.getLeft()}-${self.getRight()}-${self.getLoga()}-${self.getDivisions()}-${self.selectionValue}`
            // ), () => {
            //     _histogramGen = null;
            // });
        }, 500);

        self.defaultConfig = self.defaultConfig || {};
        self.wellSpec = self.wellSpec || [];
        self.selectionType = self.selectionType || 'family-group';
        self.zoneTree = [];
        self.zonesetName = self.zonesetName || "ZonationAll";
        self.config = self.config || {grid:true, displayMode: 'bar', colorMode: 'zone', stackMode: 'well', binGap: 5};
    }

    this.onInputSelectionChanged = function(selectedItemProps) {
        self.selectionValue = (selectedItemProps || {}).name;
    }

    function getSelectionList(selectionType, wellArray) {
        let selectionHash = {};
        let allCurves = [];
        wellArray.forEach(well => {
            let curvesInWell = getCurvesInWell(well);
            allCurves.push(...curvesInWell);
        });
        switch(selectionType) {
            case 'curve':
                allCurves.forEach(curve => {
                    selectionHash[curve.name] = 1;
                })
                break;
            case 'family': 
                allCurves.forEach(curve => {
                    let family = wiApi.getFamily(curve.idFamily);
                    if(family)
                        selectionHash[family.name] = 1;
                })
                break;
            case 'family-group':
                allCurves.forEach(curve => {
                    let family = wiApi.getFamily(curve.idFamily);
                    if(family)
                        selectionHash[family.familyGroup] = 1;
                })
                break;
        }
        self.selectionList = Object.keys(selectionHash).map(item => ({ 
            data:{label:item}, 
            properties:{name:item} 
        }));
    }
    
    this.runMatch = function (node, criteria) {
        let family;
        if (!criteria) return true;
        switch(self.selectionType) {
            case 'family-group': 
                family = wiApi.getFamily(node.idFamily);
                if (!family) return null;
                return family.familyGroup.trim().toLowerCase() === criteria.trim().toLowerCase();
            
            case 'family': 
                family = wiApi.getFamily(node.idFamily);
                if (!family) return null;
                return family.name.trim().toLowerCase() === criteria.trim().toLowerCase();
            
            case 'curve':
                return node.name.trim().toLowerCase() === criteria.trim().toLowerCase();
        }
    }
    this.getLabel = function (node) {
        return node.name;
    }
    this.getIcon = function (node) {
        if (node.idCurve) return 'curve-16x16';
        if (node.idDataset) return 'curve-data-16x16';
        if (node.idWell) return 'well-16x16';
    }
    this.getChildren = function (node) {
        if (node.idDataset) {
            return node.curves;
        }
        if (node.idWell) {
            return node.datasets;
        }
        return [];
    }
    this.clickFunction = clickFunction;
    function clickFunction($event, node, selectedObjs, treeRoot) {
        let wellSpec = self.wellSpec.find(wsp => wsp.idWell === treeRoot.idWell);
        wellSpec.idCurve = node.idCurve;
        wellSpec.idDataset = node.idDataset;
        wellSpec.curveName = node.Name;
    }
    this.refresh = function(){
        self.histogramList.length = 0;
        self.treeConfig.length = 0;
        getTree();
    };
    async function getTree(callback) {
        wiLoading.show($element.find('.main')[0]);
        self.treeConfig = [];
        let promises = [];
		for (let w of self.wellSpec) {
			try {
				let well = await wiApi.getCachedWellPromise(w.idWell || w);
				$timeout(() => self.treeConfig.push(well));
			}
			catch(e) {
				console.error(e);
			}
		}
		callback && callback();
		wiLoading.hide();
        // for (let w of self.wellSpec) {
        //     promises.push(
        //         wiApi.getWellPromise(w.idWell || w)
        //             .then(well => ($timeout(() => self.treeConfig.push(well))))
        //     );
        // }
        /*Promise.all(promises)
            .then(() => callback && callback())
            .catch(e => console.error(e))
            .finally(() => wiLoading.hide());
		*/
    }
    function getZonesetsFromWells(wells) {
        let zsList;
        for (let well of wells) {
            let zonesets = well.zone_sets;
            if (!zsList) {
                zsList = angular.copy(zonesets);
            }
            else if (zsList.length) {
                zsList = intersectAndMerge(zsList, zonesets);
            }
            else {
                break;
            }
        }
        self.zonesetList = (zsList || []).map( zs => ({
            data: {
                label: zs.name
            },
            properties: zs
        }));
        self.zonesetList.splice(0, 0, {data: {label: 'ZonationAll'}, properties: genZonationAllZS(0, 1)});
    }
    function intersectAndMerge(dstZoneList, srcZoneList) {
        return dstZoneList.filter(zs => {
            let zoneset = srcZoneList.find(zs1 => zs.name === zs1.name);
            if (!zoneset) return false;
            for (let z of zoneset.zones) {
                let zone = zs.zones.find(zo => zo.zone_template.name == z.zone_template.name);
                if (!zone) {
                    zs.zones.push(angular.copy(z));
                }
            }
            return true;
        });
    }
    this.getWellSpec = getWellSpec;
    function getWellSpec(well) {
        if (!well) return {};
        return self.wellSpec.find(wsp => wsp.idWell === well.idWell);
    }
    this.getCurve = getCurve;
    function getCurve(well) {
        let wellSpec = getWellSpec(well);
        if (!Object.keys(wellSpec).length) return {};
        let curves = getCurvesInWell(well).filter(c => self.runMatch(c, self.selectionValue));
        let curve = wellSpec.idCurve ? curves.find(c => c.idCurve === wellSpec.idCurve) : curves[0];
        if (!curve) {
            delete wellSpec.curveName;
            delete wellSpec.idCurve;
            delete wellSpec.idDataset;
            delete wellSpec.datasetName;
            delete wellSpec.datasetTop;
            delete wellSpec.datasetBottom;
            delete wellSpec.datasetStep;
            return;
        }
        wellSpec.curveName = curve.name;
        wellSpec.idCurve = curve.idCurve;
        wellSpec.idDataset = curve.idDataset;

        let datasets = self.getChildren(well);
        let dataset = wellSpec.idDataset ? datasets.find(ds => ds.idDataset === wellSpec.idDataset):datasets[0];
        wellSpec.datasetName = dataset.name;
        wellSpec.datasetTop = parseFloat(dataset.top);
        wellSpec.datasetBottom = parseFloat(dataset.bottom);
        wellSpec.datasetStep = parseFloat(dataset.step);
        return curve;
    }
    function getZoneset(well, zonesetName = "") {
        let zonesets = well.zone_sets;
        if (zonesetName === "" || zonesetName === "ZonationAll") 
            return null;
        return zonesets.find(zs => zs.name === zonesetName);
    }
    this.onZonesetSelectionChanged = function(selectedItemProps) {
        self.zoneTree = (selectedItemProps || {}).zones;
        self.zonesetName = (selectedItemProps || {}).name || 'ZonationAll';
    }
    this.runZoneMatch = function (node, criteria) {
        let keySearch = criteria.toLowerCase();
        let searchArray = node.zone_template.name.toLowerCase();
        return searchArray.includes(keySearch);
    }
    this.getZoneLabel = function (node) {
        if(!node || !node.zone_template){
            return 'aaa';
        }
        return node.zone_template.name;
    }
   
    this.getZoneIcon = (node) => ( (node && !node._notUsed) ? 'zone-16x16': 'fa fa-eye-slash' )
    const EMPTY_ARRAY = []
    this.noChildren = function (node) {
        return EMPTY_ARRAY;
    }
    this.click2ToggleZone = function ($event, node, selectedObjs) {
        node._notUsed = !node._notUsed;
        self.selectedZones = Object.values(selectedObjs).map(o => o.data);
    }
    this.click2ToggleLayer = function ($event, node, selectedObjs) {
        node._notUsed = !node._notUsed;
        self.selectedLayers = Object.values(selectedObjs).map(o => o.data);
    }
    
    this.runLayerMatch = function (node, criteria) {
        let keySearch = criteria.toLowerCase();
        let searchArray = node.name.toLowerCase();
        return searchArray.includes(keySearch);
    }
    let _layerTree = [];
    this.getLayerTree = function() {
        if(self.getStackMode() === 'all') {
            _layerTree[0] = self.histogramList;
            return _layerTree;
        }
        return self.histogramList;
    }
    this.getLayerLabel = (node) => node.name
    this.getLayerIcon = (node) => ( (node && !node._notUsed) ? 'layer-16x16': 'fa fa-eye-slash' )
    this.getConfigLeft = function() {
        self.config = self.config || {};
        return isNaN(self.config.left) ? "[empty]": wiApi.bestNumberFormat(self.config.left, 3);
    }
    this.getConfigLimitTop = function () {
        self.config = self.config || {};
        return isNaN(self.config.limitTop) ? "[empty]": wiApi.bestNumberFormat(self.config.limitTop, 3);
    }
    this.getConfigLimitBottom = function () {
        self.config = self.config || {};
        return isNaN(self.config.limitBottom) ? "[empty]": wiApi.bestNumberFormat(self.config.limitBottom, 3);
    }
    this.setConfigLimitTop = function (notUse, newValue) {
        self.config.limitTop = parseFloat(newValue)
    }
    this.setConfigLimitBottom = function (notUse, newValue) {
        self.config.limitBottom = parseFloat(newValue)
    }
    this.setConfigLeft = function(notUse, newValue) {
        self.config.left = parseFloat(newValue);
    }
    this.getConfigRight = function() {
        self.config = self.config || {};
        return isNaN(self.config.right) ? "[empty]": wiApi.bestNumberFormat(self.config.right, 3);
    }
    this.setConfigRight = function(notUse, newValue) {
        self.config.right = parseFloat(newValue);
    }
    this.getConfigDivisions = function() {
        self.config = self.config || {};
        return isNaN(self.config.divisions) ? "[empty]": self.config.divisions;
    }
    this.setConfigDivisions = function(notUse, newValue) {
        self.config.divisions = parseInt(newValue);
    }
    this.getConfigTitle = function() {
        self.config = self.config || {};
        return (self.config.title || "").length ? self.config.title : "New Histogram";
    }
    this.setConfigTitle = function(notUse, newValue) {
        self.config.title = newValue;
    }
    this.getConfigXLabel = function() {
        self.config = self.config || {};
        return (self.config.xLabel || "").length ? self.config.xLabel : self.selectionValue;
    }
    this.setConfigXLabel = function(notUse, newValue) {
        self.config.xLabel = newValue;
    }
    function clearDefaultConfig() {
        self.defaultConfig = {};
    }
    function updateDefaultConfig() {
        clearDefaultConfig();
        let curve = getCurve(self.treeConfig[0], self.wellSpec[0]);
        if (!curve) return;
        let family = wiApi.getFamily(curve.idFamily);
        if (!family) return;
        self.defaultConfig.left = family.family_spec[0].minScale;
        self.defaultConfig.right = family.family_spec[0].maxScale;
        self.defaultConfig.loga = family.family_spec[0].displayType.toLowerCase() === 'logarithmic';
    }

    this.histogramList = [];
	var flattenHistogramList = [];
	var listWellStats = [];
	var listAllStats = [];
    this.genHistogramList = async function() {
        this.histogramList.length = 0;
        let allHistogramList = []
		listWellStats.length = 0;
		listAllStats.length = 0;
        _histogramGen = null;
        wiLoading.show($element.find('.main')[0]);

		let allZones = [];
		let allDataArray = [];
        try {
            
            for (let i = 0; i < self.treeConfig.length; i++) {
                let well = self.treeConfig[i];
                if (well._notUsed) {
                    continue;
                }
                let curve = getCurve(well, self.wellSpec[i]);
                if (!curve) {
                    continue;
                }
                let datasetTop = self.wellSpec[i].datasetTop;
                let datasetBottom = self.wellSpec[i].datasetBottom;
                let datasetStep = self.wellSpec[i].datasetStep;

                let zoneset = getZoneset(well, self.zonesetName);
                zoneset = zoneset || genZonationAllZS(datasetTop, datasetBottom, well.color);

                let curveData = await wiApi.getCachedCurveDataPromise(curve.idCurve);
                curveData = curveData.filter(d => _.isFinite(d.x))
                    .map(d => ({
                        ...d, 
                        depth: datasetStep>0?(datasetTop + d.y * datasetStep):d.y
                    }));
                let zones = zoneset.zones.filter(zone => {
                    let z = self.zoneTree.find(z1 => {
                        return z1.zone_template.name === zone.zone_template.name
                    });
                    return !z._notUsed;
                });
				if (self.getStackMode() === 'all') {
					allZones = [...allZones, ...zones];
				}
                let wellHistogramList = [];
				let wellDataArray = [];
                for (let j = 0; j < zones.length; j++) {
                    let zone = zones[j];
                    let dataArray = filterData(curveData, zone);
					dataArray.top = zone.startDepth;
					dataArray.bottom = zone.endDepth;
					if (self.getStackMode() === 'well') {
						wellDataArray = [...wellDataArray, ...dataArray];
					} else if (self.getStackMode() === 'all') {
						allDataArray = [...allDataArray, ...dataArray];
					}
                    let bins = genBins(dataArray);
                    bins.color = self.getColor(zone, well);
                    bins.name = `${well.name}.${zone.zone_template.name}`;

					bins.stats = {};
					bins.stats.top = zone.startDepth;
					bins.stats.bottom = zone.endDepth;
					let stats = setStats(dataArray.map(d => d.x));
					bins.stats = Object.assign(bins.stats, stats);
					wellHistogramList.push(bins);
                    // try {
                    //     bins.avg = d3.mean(dataArray, d => d.x);
                    //     bins.min = d3.min(dataArray, d => d.x);
                    //     bins.max = d3.max(dataArray, d => d.x);
                    //     bins.stddev = d3.deviation(dataArray, d => d.x);
                    //     bins.avgdev = calAverageDeviation(dataArray.map(d => d.x));
                    //     bins.var = d3.variance(dataArray, d => d.x);
                    //     bins.median = d3.median(dataArray, d => d.x);
                    //     bins.skew = dataArray.length >= 3 ? ss.sampleSkewness(dataArray.map(d => d.x)) : undefined;
                    //     bins.kurtosis = dataArray.length >= 4 ? ss.sampleKurtosis(dataArray.map(d => d.x)) : undefined;
                    //     bins.p10 = calPercentile(dataArray.map(d => d.x), 0.1);
                    //     bins.p50 = calPercentile(dataArray.map(d => d.x), 0.5);
                    //     bins.p90 = calPercentile(dataArray.map(d => d.x), 0.9);
                    //     wellHistogramList.push(bins);
                    // }
                    // catch(e) {
                    //     console.error(e);
                    // }
                }
                if (self.getStackMode() === 'well') {
					let stats = setStats(wellDataArray.map(d => d.x));
					stats.top = d3.min(zones, z => z.startDepth);
					stats.bottom = d3.max(zones, z => z.endDepth);
					listWellStats.push(stats);
                    wellHistogramList.name = well.name;
                    allHistogramList.push(wellHistogramList);
                }
                else allHistogramList.push(...wellHistogramList);
            }
            allHistogramList.name = 'All';
            let max = 0;
			let flatten = [];
            switch(self.getStackMode()) {
                case 'none':
                    for (let bins of allHistogramList) {
                        let maybeMax = d3.max(bins.map(b => b.length));
                        max = (max > maybeMax) ? max : maybeMax;
                    }
					flatten = allHistogramList;
                    break;
                case 'well':
                {
                    for (let groupOfBins of allHistogramList) {
                        let aggregate = aggregateHistogramList(groupOfBins);
                        let maybeMax = d3.max(aggregate);
                        max = (max > maybeMax) ? max : maybeMax;
						flatten = flatten.concat(groupOfBins);
                    }
                }
                break;
                case 'all': 
                {
                    let aggregate = aggregateHistogramList(allHistogramList);
                    max = d3.max(aggregate);
					flatten = allHistogramList;

					let stats = setStats(allDataArray.map(d => d.x));
					stats.top = d3.min(allZones, z => z.startDepth);
					stats.bottom = d3.max(allZones, z => z.endDepth);
					listAllStats.push(stats);
                }
                break;
                    
            }
            $timeout(() => {
                self.minY = 0;
                self.maxY = max;
                self.histogramList = allHistogramList;
				flattenHistogramList = flatten;
            });
        }
        catch(e) {
            console.error(e);
        }
        wiLoading.hide();
        console.log('end');
    }
	function setStats(dataArray) {
		let stats = {};
		try {
			stats.numPoints = dataArray.length;
			stats.avg = d3.mean(dataArray);
			stats.min = d3.min(dataArray);
			stats.max = d3.max(dataArray);
			stats.stddev = d3.deviation(dataArray);
			stats.avgdev = calAverageDeviation(dataArray);
			stats.var = d3.variance(dataArray);
			stats.median = d3.median(dataArray);
			stats.skew = dataArray.length >= 3 ? ss.sampleSkewness(dataArray) : undefined;
			stats.kurtosis = dataArray.length >= 4 ? ss.sampleKurtosis(dataArray) : undefined;
			stats.p10 = calPercentile(dataArray, 0.1);
			stats.p50 = calPercentile(dataArray, 0.5);
			stats.p90 = calPercentile(dataArray, 0.9);
		}
		catch(e) {
			console.error(e);
		}
		return stats;
	}
	function calAverageDeviation(data) {
		if (data.length < 1) return;
        let mean = d3.mean(data);

        return d3.mean(data, function (d) {
            return Math.abs(d - mean)
        }).toFixed(_DECIMAL_LEN);
    }
	function calPercentile(data, p) {
		if (data.length < 1) return;
        return d3.quantile(data.sort(function (a, b) {
            return a - b;
        }), p).toFixed(_DECIMAL_LEN);
    }
    function aggregateHistogramList(histogramList) {
        let aggregate = [];
        for (let bins of histogramList) {
            for (let j = 0; j < bins.length; j++) {
                aggregate[j] = ((aggregate[j] || 0) + bins[j].length);
            }
        }
        return aggregate;
    }
    function genZonationAllZS(top, bottom, color = 'blue') {
        return {
            name: 'ZonationAll',
            zones: [{
                startDepth: top,
                endDepth: bottom,
                zone_template: {
                    name: 'ZonationAll',
                    background: color
                }
            }]
        }
    }
    this.genBins = genBins;
    function genBins(pointset) {
        let divisions = self.getDivisions();
        let loga = self.getLoga();
        let histogramGen = getHistogramFn(divisions, loga);
        return histogramGen(pointset.map(d => d.x));
    }
    var _histogramGen;
    function getHistogramFn(divisions, loga) {
        if (!_histogramGen) {
            let left = self.getLeft();
            let right = self.getRight();
            let divisions = self.getDivisions();
            let domain = d3.extent([left, right]);
            let thresholds;
            if (!loga) {
                thresholds = d3.range(domain[0], domain[1], (domain[1] - domain[0])/divisions);
            }
            else {
                let logMinVal = Math.log10(domain[0] || 0.01);
                let logMaxVal = Math.log10(domain[1] || 0.01);
                thresholds = d3.range(logMinVal, logMaxVal, (logMaxVal - logMinVal)/divisions).map(v => Math.pow(10, v)); 
            }
            _histogramGen = d3.histogram().domain(domain).thresholds(thresholds);
        }
        return _histogramGen;
    }
    function filterData(curveData, zone) {
        return curveData.filter(d => ((zone.startDepth - d.depth)*(zone.endDepth - d.depth) <= 0));
    }

    this.getLeft = () => ( self.config.left || self.defaultConfig.left || 0 )
    this.getRight = () => ( self.config.right || self.defaultConfig.right || 0 )
    this.getLoga = () => (self.config.loga || self.defaultConfig.loga || 0)
    this.getDivisions = () => (self.config.divisions || self.defaultConfig.divisions || 10)
    this.getColorMode = () => (self.config.colorMode || self.defaultConfig.colorMode || 'zone')
    this.getColor = (zone, well) => {
        let cMode = self.getColorMode();
        return cMode === 'zone' ? zone.zone_template.background:(cMode === 'well'?well.color:'blue');
    }
    this.getDisplayMode = () => (self.config.displayMode || self.defaultConfig.displayMode || 'bar')
    this.getStackMode = () => (self.config.stackMode || self.defaultConfig.stackMode || 'none')
    this.getBinGap = () => (self.config.binGap || self.defaultConfig.binGap)
    this.getBinX = (bin) => ((bin.x0 + bin.x1)/2)
    this.getBinY = (bin) => (bin.length)

    this.colorFn = function(bin, bins) {
        if (self.getStackMode() === 'none');
        return bins.color;
    }

	this.save = function() {
		console.log('save');
		if (!self.idHistogram) {
			wiDialog.promptDialog({
				title: 'New Histogram',
				inputName: 'Histogram Name',
				input: self.getConfigTitle(),
			}, function(name) {
				let type = 'HISTOGRAM';
				let content = {
					wellSpec: self.wellSpec,
					zonesetName: self.zonesetName,
					selectionType: self.selectionType,
					selectionValue: self.selectionValue,
					config: self.config	
				}
				wiApi.newAssetPromise(self.idProject, name, type, content).then(res => {
					self.setConfigTitle(null, name);
					self.idHistogram = res.idParameterSet;
					console.log(res);
				})
					.catch(e => {
						console.error(e);
						self.save();
					})
			});
		}
		else {
			let type = 'HISTOGRAM';
			let content = {
				idParameterSet: self.idHistogram,
				wellSpec: self.wellSpec,
				zonesetName: self.zonesetName,
				selectionType: self.selectionType,
				selectionValue: self.selectionValue,
				config: self.config	
			}
			wiApi.editAssetPromise(self.idHistogram, content).then(res => {
				console.log(res);
			})
				.catch(e => {
					console.error(e);
				});
		}
	}

    let _zoneNames = []
    self.getZoneNames = function() {
        _zoneNames.length = 0;
        Object.assign(_zoneNames, self.histogramList.map(bins => bins.name));
        return _zoneNames;
    }
    self.statsValue = function ([row, col]) {
		let statsArray = [];
		switch(self.getStackMode()) {
			case 'none':
				statsArray = flattenHistogramList.map(e => e.stats);
				break;
			case 'well':
				statsArray = [...listWellStats];
				break;
			case 'all':
				// statsArray = [...listAllStats];
				statsArray = flattenHistogramList.map(e => e.stats);
				break;
			default:
				statsArray = [];
		}

		try {
			switch(_headers[col]){
				case 'top': 
					return wiApi.bestNumberFormat(statsArray[row].top, 4) || 'N/A';
				case 'bottom': 
					return wiApi.bestNumberFormat(statsArray[row].bottom, 4) || 'N/A';
				case '#pts':
					return statsArray[row].numPoints || 'N/A';
				case 'avg':
					return wiApi.bestNumberFormat(statsArray[row].avg) || 'N/A'
				case 'min':
					return wiApi.bestNumberFormat(statsArray[row].min) || 'N/A'
				case 'max':
					return wiApi.bestNumberFormat(statsArray[row].max )|| 'N/A'
				case 'avgdev': 
					return wiApi.bestNumberFormat(statsArray[row].avgdev) || 'N/A';
				case 'stddev': 
					return wiApi.bestNumberFormat(statsArray[row].stddev) || 'N/A';
				case 'var':
					return wiApi.bestNumberFormat(statsArray[row].var) || 'N/A';
				case 'skew':
					return wiApi.bestNumberFormat(statsArray[row].skew) || 'N/A';
				case 'kurtosis':
					return wiApi.bestNumberFormat(statsArray[row].kurtosis) || 'N/A';
				case 'median':
					return wiApi.bestNumberFormat(statsArray[row].median) || 'N/A';
				case 'p10': 
					return wiApi.bestNumberFormat(statsArray[row].p10) || 'N/A';
				case 'p50': 
					return wiApi.bestNumberFormat(statsArray[row].p50) || 'N/A';
				case 'p90': 
					return wiApi.bestNumberFormat(statsArray[row].p90) || 'N/A';
				default: 
					return "this default";
			}
		} catch {
			return 'N/A';
		}
    }
    let _headers = [];
    self.getHeaders = function (){
        _headers.length = 0;
        Object.assign(_headers, self.statisticHeaders.filter((item, idx) => self.statisticHeaderMasks[idx]));
        return _headers;
    }
    this.hideSelectedLayer = function() {
        if(!self.selectedLayers) return;
        self.selectedLayers.forEach(layer => layer._notUsed = true);
    }
    this.showSelectedLayer = function() {
        if(!self.selectedLayers) return;
        self.selectedLayers.forEach(layer => layer._notUsed = false);
        $timeout(() => {});
    }
    this.hideAllLayer = function() {
        self.histogramList.forEach(bins => bins._notUsed = true);
        $timeout(() => {});
    }
    this.showAllLayer = function() {
        self.histogramList.forEach(bins => bins._notUsed = false);
        $timeout(() => {});
    }

    //--------------

    this.hideSelectedZone = function() {
        if(!self.selectedZones) return;
        self.selectedZones.forEach(layer => layer._notUsed = true);
    }
    this.showSelectedZone = function() {
        if(!self.selectedZones) return;
        self.selectedZones.forEach(layer => layer._notUsed = false);
        $timeout(() => {});
    }
    this.hideAllZone = function() {
        self.zoneTree.forEach(bins => bins._notUsed = true);
        $timeout(() => {});
    }
    this.showAllZone = function() {
        self.zoneTree.forEach(bins => bins._notUsed = false);
        $timeout(() => {});
    }
    this.onDrop = function (event, helper, myData) {
        let idWells = helper.data('idWells');
        if (idWells && idWells.length) {
            $timeout(() => {
                for (let idWell of idWells) {
                    if (!self.wellSpec.find(wsp => wsp.idWell === idWell)) {
                        self.wellSpec.push({idWell});
                    }
                }
            })
        }
    }
    this.toggleWell = function(well) {
        well._notUsed = !well._notUsed;
    }
    this.removeWell = function(well) {
        let index = self.wellSpec.findIndex(wsp => wsp.idWell === well.idWell);
        if(index >= 0) {
            self.wellSpec.splice(index, 1);
        }
    }
    
}
