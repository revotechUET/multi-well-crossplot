var componentName = 'multiWellCrossplot';
module.exports.name = componentName;
require('./style.less');
const regression = require('../../bower_components/regression-js/dist/regression.min.js');

const _DECIMAL_LEN = 4;

var app = angular.module(componentName, [
    'sideBar', 'wiTreeView', 'wiTableView',
    'wiApi', 'editable', 
    'wiDialog',
    'wiDroppable', 'wiDropdownList', 'angularResizable',
    'plot-toolkit', 
    'wiLoading', 'line-style'
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
        selectionValueList: '<',
        idCrossplot: "<",
        config: '<',
        printSettings: '<',
        onSave: '<',
        udls: '<',
        polygons: '<',
        polygonExclude: '<',
        regressionType: '<'
    },
    transclude: true
});

function multiWellCrossplotController($scope, $timeout, $element, wiToken, wiApi, wiDialog, wiLoading) {
    let self = this;
    self.treeConfig = [];
    self.selectedNode = null;
    self.datasets = {};
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
        self.isSettingChange = true;
        self.defaultConfig = self.defaultConfig || {};
        self.wellSpec = self.wellSpec || [];
        self.selectionType = self.selectionType || 'family-group';
        self.zoneTree = [];
        self.zonesetName = self.zonesetName || "ZonationAll";
        self.config = self.config || {grid:true, displayMode: 'bar', colorMode: 'zone', stackMode: 'well', binGap: 5, title: self.title || ''};
        self.printSettings = self.printSettings || {orientation: 'portrait', aspectRatio: '16:9', alignment: 'left', border: false,
            width: 210,
            vMargin: 0,
            hMargin: 0
        };
        self.udls = self.udls || [];
        self.polygons = self.polygons || [];
        self.polygonExclude = self.polygonExclude || false;
        self.selectionValueList = self.selectionValueList || self.initSelectionValueList();
        self.selectionValueList.forEach(s => {
            setOnChangeFn(s);
        })
        self.statisticHeaders = ['xAxis','yAxis','z1Axis','z2Axis','z3Axis','#pts'];
        self.statisticHeaderMasks = [true,true, self.getSelectionValue('Z1').isUsed, self.getSelectionValue('Z2').isUsed, self.getSelectionValue('Z3').isUsed,true];
        self.regressionType = self.regressionType || 'Linear';
        getRegressionTypeList();

        if (self.token)
            wiToken.setToken(self.token);
        $timeout(() => {
            $scope.$watch(() => self.config, (newVal, oldVal) => {
                self.isSettingChange = true;
            }, true)
            $scope.$watch(() => self.zonesetName, (newVal, oldVal) => {
                self.isSettingChange = true;
            })
            $scope.$watch(() => (self.wellSpec.map(wsp => wsp.discriminator)), () => {
                self.isSettingChange = true;
            }, true)
            $scope.$watch(() => (self.wellSpec.map(wsp => wsp.idWell)), () => {
                self.isSettingChange = true;
                getTree();
            }, true);
            $scope.$watch(() => {
                return self.wellSpec.map(wsp => {
                    return `${wsp.xAxis ? wsp.xAxis.idCurve : ''}-
                        ${wsp.yAxis ? wsp.yAxis.idCurve : ''}-
                        ${wsp.z1Axis ? wsp.z1Axis.idCurve : ''}-
                        ${wsp.z2Axis ? wsp.z2Axis.idCurve : ''}-
                        ${wsp.z3Axis ? wsp.z3Axis.idCurve : ''}`;
                }).join('');
            }, () => {
                self.isSettingChange = true;
            }, true);
            $scope.$watch(() => (self.selectionType), (newVal, oldVal) => {
                self.isSettingChange = true;
                getSelectionList(self.selectionType, self.treeConfig);
                updateDefaultConfig();
                if (newVal != oldVal) {
                    self.selectionValueList.forEach(s => {
                        s.value = self.selectionList[0].properties.name;
                    })
                }
            });
            $scope.$watch(() => {
                return `${JSON.stringify(self.selectionValueList)}`;
            }, () => {
                self.isSettingChange = true;
                updateDefaultConfig();
                self.updateShowZStats();
            });
            $scope.$watch(() => (self.treeConfig.map(w => w.idWell)), () => {
                getSelectionList(self.selectionType, self.treeConfig);
                getZonesetsFromWells(self.treeConfig);
                updateDefaultConfig();
            }, true);
            $scope.$watch(() => `${self.regressionType}-${self.polygonExclude}-${JSON.stringify(self.polygons)}`, () => {
                self.layers.forEach(l => {
                    self.updateRegressionLine(l, self.regressionType, self.polygons);
                })
            })
        }, 700);

        $scope.vPadding = 50;
        $scope.hPadding = 60;
    }

    self.updateShowZStats = function() {
        let z1Idx = self.statisticHeaders.indexOf('z1Axis');
        let z2Idx = self.statisticHeaders.indexOf('z2Axis');
        let z3Idx = self.statisticHeaders.indexOf('z3Axis');
        self.statisticHeaderMasks[z1Idx] = self.getSelectionValue('Z1').isUsed;
        self.statisticHeaderMasks[z2Idx] = self.getSelectionValue('Z2').isUsed;
        self.statisticHeaderMasks[z3Idx] = self.getSelectionValue('Z3').isUsed;
    }
    self.statsValue = function ([row, col]) {
        let statsArray = self.layers;
        try {
            switch(_headers[col]){
                case 'xAxis':
                    return statsArray[row].curveXInfo || 'N/A';
                case 'yAxis':
                    return statsArray[row].curveYInfo || 'N/A';
                case 'z1Axis':
                    return statsArray[row].curveZ1Info || 'N/A';
                case 'z2Axis':
                    return statsArray[row].curveZ2Info || 'N/A';
                case 'z3Axis':
                    return statsArray[row].curveZ3Info || 'N/A';
                case '#pts':
                    return statsArray[row].numPoints;
                default:
                    return "this default";
            }
        } catch {
            return 'N/A';
        }
    }
    self.getStatsRowIcons = function(rowIdx) {
        return ['rectangle'];
    }
    self.getStatsIconStyle = function(rowIdx) {
        return {
            'background-color': self.layers[rowIdx].layerColor
        }
    }

    this.initSelectionValueList = () => {
        let selectionValueList = [{
            name: 'X',
            label: 'X Axis',
            value: 'Slowness',
            isUsed: true
        }, {
            name: 'Y',
            label: 'Y Axis',
            value: 'Gamma Ray',
            isUsed: true
        }, {
            name: 'Z1',
            label: 'Z1 Axis',
            value: 'Angle'
        }, {
            name: 'Z2',
            label: 'Z2 Axis',
            value: 'Diameter'
        }, {
            name: 'Z3',
            label: 'Z3 Axis',
            value: 'Density'
        }]
        return selectionValueList;
    }
    function setOnChangeFn(obj) {
        if (!obj.onChange) {
            obj.onChange = (function(selectedItemProps) {
                this.value = (selectedItemProps || {}).name;
            }).bind(obj);
        }
    }
    this.getSelectionValue = (name) => {
        if (!self.selectionValueList.length) return '';
        let selectionValue = self.selectionValueList.find(s => {
            return s.name == name;
        })
        return selectionValue;
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
        switch(treeRoot.isSettingAxis) {
            case 'X':
                wellSpec.xAxis = {};
                wellSpec.xAxis.idCurve = node.idCurve;
                wellSpec.xAxis.idDataset = node.idDataset;
                break;
            case 'Y':
                wellSpec.yAxis = {};
                wellSpec.yAxis.idCurve = node.idCurve;
                wellSpec.yAxis.idDataset = node.idDataset;
                break;
            case 'Z1':
                wellSpec.z1Axis = {};
                wellSpec.z1Axis.idCurve = node.idCurve;
                wellSpec.z1Axis.idDataset = node.idDataset;
                break;
            case 'Z2':
                wellSpec.z2Axis = {};
                wellSpec.z2Axis.idCurve = node.idCurve;
                wellSpec.z2Axis.idDataset = node.idDataset;
                break;
            case 'Z3':
                wellSpec.z3Axis = {};
                wellSpec.z3Axis.idCurve = node.idCurve;
                wellSpec.z3Axis.idDataset = node.idDataset;
                break;
            default:
        }
    }
    this.refresh = function(){
        self.layers.length = 0;
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
                well.isSettingAxis = 'X';
                $timeout(() => {
                    self.treeConfig.push(well);
                });
            }
            catch(e) {
                console.error(e);
            }
        }
        callback && callback();
        wiLoading.hide();
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
    self.getAxisKey = function(isSettingAxis) {
        switch(isSettingAxis) {
            case 'X':
                return 'xAxis';
            case 'Y':
                return 'yAxis';
            case 'Z1':
                return 'z1Axis';
            case 'Z2':
                return 'z2Axis';
            case 'Z3':
                return 'z3Axis';
            default:
        }
    }
    this.getCurve = getCurve;
    function getCurve(well, requiredAxis) {
        let wellSpec = getWellSpec(well);
        if (!Object.keys(wellSpec).length) return {};
        let axis = requiredAxis || self.getAxisKey(well.isSettingAxis);
        let curves = getCurvesInWell(well).filter(c => self.runWellMatch(c, self.getFilterForWell(axis)));
        let curve = wellSpec[axis] && wellSpec[axis].idCurve ? curves.find(c => c.idCurve === wellSpec[axis].idCurve) : curves[0];
        if (!curve) {
            wellSpec[axis] = {};
            return;
        }
        if (wellSpec[axis] == undefined) wellSpec[axis] = {};
        wellSpec[axis].curveName = curve.name;
        wellSpec[axis].idCurve = curve.idCurve;
        wellSpec[axis].idDataset = curve.idDataset;

        let datasets = self.getChildren(well);
        let dataset = wellSpec[axis] && wellSpec[axis].idDataset ? datasets.find(ds => ds.idDataset === wellSpec[axis].idDataset):datasets[0];
        wellSpec[axis].datasetName = dataset.name;
        wellSpec[axis].datasetTop = parseFloat(dataset.top);
        wellSpec[axis].datasetBottom = parseFloat(dataset.bottom);
        wellSpec[axis].datasetStep = parseFloat(dataset.step);
        return curve;
    }
    const EMPTY_ARRAY = []
    this.noChildren = function (node) {
        return EMPTY_ARRAY;
    }

    // ---CONFIG---
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
    this.getConfigMajorX = function() {
        self.config = self.config || {};
        return isNaN(self.config.majorX) ? "[empty]": wiApi.bestNumberFormat(self.config.majorX, 3);
    }
    this.setConfigMajorX = function(notUse, newValue) {
        self.config.majorX = parseFloat(newValue);
    }
    this.getConfigMajorY = function() {
        self.config = self.config || {};
        return isNaN(self.config.majorY) ? "[empty]": wiApi.bestNumberFormat(self.config.majorY, 3);
    }
    this.setConfigMajorY = function(notUse, newValue) {
        self.config.majorY = parseFloat(newValue);
    }
    this.getConfigMinorX = function() {
        self.config = self.config || {};
        return isNaN(self.config.minorX) ? "[empty]": wiApi.bestNumberFormat(self.config.minorX, 3);
    }
    this.setConfigMinorX = function(notUse, newValue) {
        self.config.minorX = parseFloat(newValue);
    }
    this.getConfigMinorY = function() {
        self.config = self.config || {};
        return isNaN(self.config.minorY) ? "[empty]": wiApi.bestNumberFormat(self.config.minorY, 3);
    }
    this.setConfigMinorY = function(notUse, newValue) {
        self.config.minorY = parseFloat(newValue);
    }
    this.getConfigTop = function() {
        self.config = self.config || {};
        return isNaN(self.config.top) ? "[empty]": wiApi.bestNumberFormat(self.config.top, 3);
    }
    this.setConfigTop = function(notUse, newValue) {
        self.config.top = parseFloat(newValue);
    }
    this.getConfigBottom = function() {
        self.config = self.config || {};
        return isNaN(self.config.bottom) ? "[empty]": wiApi.bestNumberFormat(self.config.bottom, 3);
    }
    this.setConfigBottom = function(notUse, newValue) {
        self.config.bottom = parseFloat(newValue);
    }
    this.getConfigTitle = function() {
        self.config = self.config || {};
        return (self.config.title || "").length ? self.config.title : "New Crossplot";
    }
    this.setConfigTitle = function(notUse, newValue) {
        self.config.title = newValue;
    }
    this.getConfigXLabel = function() {
        self.config = self.config || {};
        return (self.config.xLabel || "").length ? self.config.xLabel : ((self.getCurve(self.treeConfig[0], 'xAxis')||{}).name || '[Unknown]');
    }
    this.setConfigXLabel = function(notUse, newValue) {
        self.config.xLabel = newValue;
    }
    this.getConfigYLabel = function() {
        self.config = self.config || {};
        return (self.config.yLabel || "").length ? self.config.yLabel : ((self.getCurve(self.treeConfig[0], 'yAxis') || {}).name || '[Unknown]');
    }
    this.setConfigYLabel = function(notUse, newValue) {
        self.config.yLabel = newValue;
    }
    this.setZ1Min = function(notUse, newValue) {
        self.config.z1Min = parseFloat(newValue);
    }
    this.setZ1Max = function(notUse, newValue) {
        self.config.z1Max = parseFloat(newValue);
    }
    this.setZ1N = function(notUse, newValue) {
        self.config.z1N = parseFloat(newValue);
    }
    this.setZ2Min = function(notUse, newValue) {
        self.config.z2Min = parseFloat(newValue);
    }
    this.setZ2Max = function(notUse, newValue) {
        self.config.z2Max = parseFloat(newValue);
    }
    this.setZ2N = function(notUse, newValue) {
        self.config.z2N = parseFloat(newValue);
    }
    this.setZ3Min = function(notUse, newValue) {
        self.config.z3Min = parseFloat(newValue);
    }
    this.setZ3Max = function(notUse, newValue) {
        self.config.z3Max = parseFloat(newValue);
    }
    this.setZ3N = function(notUse, newValue) {
        self.config.z3N = parseFloat(newValue);
    }
    this.getZ1Min = () => (isNaN(self.config.z1Min) ? (isNaN(self.defaultConfig.z1Min) ? '[empty]' : self.defaultConfig.z1Min) : self.config.z1Min)
    this.getZ1Max = () => (isNaN(self.config.z1Max) ? (isNaN(self.defaultConfig.z1Max) ? '[empty]' : self.defaultConfig.z1Max) : self.config.z1Max)
    this.getZ1N = () => (isNaN(self.config.z1N) ? (isNaN(self.defaultConfig.z1N) ? '[empty]' : self.defaultConfig.z1N) : self.config.z1N)
    this.getZ2Min = () => (isNaN(self.config.z2Min) ? (isNaN(self.defaultConfig.z2Min) ? '[empty]' : self.defaultConfig.z2Min) : self.config.z2Min)
    this.getZ2Max = () => (isNaN(self.config.z2Max) ? (isNaN(self.defaultConfig.z2Max) ? '[empty]' : self.defaultConfig.z2Max) : self.config.z2Max)
    this.getZ2N = () => (isNaN(self.config.z2N) ? (isNaN(self.defaultConfig.z2N) ? '[empty]' : self.defaultConfig.z2N) : self.config.z2N)
    this.getZ3Min = () => (isNaN(self.config.z3Min) ? (isNaN(self.defaultConfig.z3Min) ? '[empty]' : self.defaultConfig.z3Min) : self.config.z3Min)
    this.getZ3Max = () => (isNaN(self.config.z3Max) ? (isNaN(self.defaultConfig.z3Max) ? '[empty]' : self.defaultConfig.z3Max) : self.config.z3Max)
    this.getZ3N = () => (isNaN(self.config.z3N) ? (isNaN(self.defaultConfig.z3N) ? '[empty]' : self.defaultConfig.z3N) : self.config.z3N)
    this.getTop = () => (isNaN(self.config.top) ? (self.defaultConfig.top || 0) : self.config.top)
    this.getBottom = () => (isNaN(self.config.bottom) ? (self.defaultConfig.bottom || 0) : self.config.bottom)
    this.getLeft = () => (isNaN(self.config.left) ? (self.defaultConfig.left || 0) : self.config.left)
    this.getRight = () => (isNaN(self.config.right) ? (self.defaultConfig.right || 0) : self.config.right)
    this.getMajorX = () => ( self.config.majorX || self.defaultConfig.majorX || 5 )
    this.getMajorY = () => ( self.config.majorY || self.defaultConfig.majorY || 5 )
    this.getMinorX = () => ( self.config.minorX || self.defaultConfig.minorX || 1 )
    this.getMinorY = () => ( self.config.minorY || self.defaultConfig.minorY || 1 )
    this.getLogaX = () => (self.config.logaX || self.defaultConfig.logaX || 0)
    this.getLogaY = () => (self.config.logaY || self.defaultConfig.logaY || 0)
    this.getColorMode = () => (self.config.colorMode || self.defaultConfig.colorMode || 'zone')
    this.getColor = (zone, well) => {
        let cMode = self.getColorMode();
        return cMode === 'zone' ? zone.zone_template.background:(cMode === 'well'?well.color:'red');
    }

    // ---DEFAULT CONFIG
    function clearDefaultConfig() {
        self.defaultConfig = {};
    }
    function updateDefaultConfig() {
        clearDefaultConfig();
        self.selectionValueList.forEach(s => {
            if (s.isUsed) {
                setDefaultConfig(self.getAxisKey(s.name));
            }
        })

        function setDefaultConfig(axis) {
            let curve = getCurve(self.treeConfig[0], axis);
            if (!curve) return;
            let family = wiApi.getFamily(curve.idFamily);
            if (!family) return;
            switch (axis) {
                case 'xAxis':
                    self.defaultConfig.left = family.family_spec[0].minScale;
                    self.defaultConfig.right = family.family_spec[0].maxScale;
                    self.defaultConfig.logaX = family.family_spec[0].displayType.toLowerCase() === 'logarithmic';
                    break;
                case 'yAxis':
                    self.defaultConfig.top = family.family_spec[0].maxScale;
                    self.defaultConfig.bottom = family.family_spec[0].minScale;
                    self.defaultConfig.logaY = family.family_spec[0].displayType.toLowerCase() === 'logarithmic';
                    break;
                case 'z1Axis':
                    self.config.z1Max = family.family_spec[0].maxScale;
                    self.config.z1Min = family.family_spec[0].minScale;
                    self.config.z1N = 5;
                    break;
                case 'z2Axis':
                    self.config.z2Max = family.family_spec[0].maxScale;
                    self.config.z2Min = family.family_spec[0].minScale;
                    self.config.z2N = 5;
                    break;
                case 'z3Axis':
                    self.config.z3Max = family.family_spec[0].maxScale;
                    self.config.z3Min = family.family_spec[0].minScale;
                    self.config.z3N = 5;
                    break;
                default:
            }
        }
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

    function filterData(curveData, zone) {
        return curveData.filter(d => ((zone.startDepth - d.depth)*(zone.endDepth - d.depth) <= 0));
    }

    // ---ASSET
    this.saveToAsset = function() {
        let type = 'CROSSPLOT';
        let content = {
            wellSpec: self.wellSpec,
            zonesetName: self.zonesetName,
            selectionType: self.selectionType,
            selectionValueList: self.selectionValueList,
            udls: self.udls,
            polygons: self.polygons,
            polygonExclude: self.polygonExclude,
            regressionType: self.regressionType,
            config: self.config	
        }
        if (!self.idCrossplot) {
            wiDialog.promptDialog({
                title: 'New Crossplot',
                inputName: 'Crossplot Name',
                input: self.getConfigTitle(),
            }, function(name) {
                content.config.title = name;
                wiLoading.show($element.find('.main')[0]);
                wiApi.newAssetPromise(self.idProject, name, type, content).then(res => {
                    self.setConfigTitle(null, name);
                    self.idCrossplot = res.idParameterSet;
                    wiLoading.hide();
                    //self.onSave && self.onSave('multi-well-crossplot' + res.idParameterSet, name);
                })
                    .catch(e => {
                        console.error(e);
                        wiLoading.hide();
                        self.saveToAsset();
                    })
            });
        } else {
            wiLoading.show($element.find('.main')[0]);
            content.idParameterSet = self.idParameterSet;
            wiApi.editAssetPromise(self.idCrossplot, content).then(res => {
                wiLoading.hide();
            })
                .catch(e => {
                    wiLoading.hide();
                    console.error(e);
                });
        }
    }
    this.saveAs = function() {
        console.log("saveAs");
        wiDialog.promptDialog({
            title: 'Save As Crossplot',
            inputName: 'Crossplot Name',
            input: '',
        }, function(name) {
            let type = 'CROSSPLOT';
            let content = {
                wellSpec: self.wellSpec,
                zonesetName: self.zonesetName,
                selectionType: self.selectionType,
                selectionValueList: self.selectionValueList,
                udls: self.udls,
                polygons: self.polygons,
                polygonExclude: self.polygonExclude,
                regressionType: self.regressionType,
                config: {...self.config, title: name} 
            }
            wiApi.newAssetPromise(self.idProject, name, type, content).then(res => {
                self.idCrossplot = res.idParameterSet;
                console.log(res);
                //self.onSave && self.onSave('multi-well-crossplot' + res.idParameterSet, name);
            })
                .catch(e => {
                    console.error(e);
                    self.saveAs();
                })
        });
    }

    // ---ZONE
    let _zoneNames = []
    self.getZoneNames = function() {
        _zoneNames.length = 0;
        Object.assign(_zoneNames, self.layers.map(bins => bins.name));
        return _zoneNames;
    }
    let _headers = [];
    self.getHeaders = function (){
        _headers.length = 0;
        Object.assign(_headers, self.statisticHeaders.filter((item, idx) => self.statisticHeaderMasks[idx]));
        return _headers;
    }
    this.hideSelectedZone = function() {
        if(!self.selectedZones) return;
        let _notUsed = true;
        self.selectedZones.forEach(layer => {
            layer._notUsed = true;
            self.onUseZoneChange(layer);
        });
    }
    this.showSelectedZone = function() {
        if(!self.selectedZones) return;
        self.selectedZones.forEach(layer => {
            layer._notUsed = false;
            self.onUseZoneChange(layer);
        });
        $timeout(() => {});
    }
    this.hideAllZone = function() {
        self.zoneTree.forEach(bins => {
            bins._notUsed = true;
            self.onUseZoneChange(bins);
        });
        $timeout(() => {});
    }
    this.showAllZone = function() {
        self.zoneTree.forEach(bins => {
            bins._notUsed = false
            self.onUseZoneChange(bins);
        });
        $timeout(() => {});
    }
    self._hiddenZone = [];
    this.getHiddenZone = function() {
        return self._hiddenZone;
    }
    this.getZoneIcon = (node) => ( (node && !node._notUsed) ? 'zone-16x16': 'fa fa-eye-slash' )
    this._notUsedLayer = [];
    this.click2ToggleZone = function ($event, node, selectedObjs) {
        node._notUsed = !node._notUsed;
        self.onUseZoneChange(node);
        self.selectedZones = Object.values(selectedObjs).map(o => o.data);
    }
    this.onUseZoneChange = (node) => {
        if (node._notUsed) {
            while(layer = self.layers.find(layer => {
                return layer.zone == node.zone_template.name;
            })) {
                self._notUsedLayer.push(layer);
                self.layers.splice(self.layers.indexOf(layer), 1);
            }
        } else {
            let layers = self._notUsedLayer.filter(layer => {
                return layer.zone == node.zone_template.name;
            })
            self.layers = self.layers.concat(layers);
            self._notUsedLayer = self._notUsedLayer.filter(l => {
                return l.zone != node.zone_template.name;
            })
        }
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

    // ---WELL
    this.getWellSpec = getWellSpec;
    function getWellSpec(well) {
        if (!well) return {};
        return self.wellSpec.find(wsp => wsp.idWell === well.idWell);
    }
    this.onDrop = function (event, helper, myData) {
        let idWells = helper.data('idWells');
        if (idWells && idWells.length) {
            $timeout(() => {
                for (let idWell of idWells) {
                    wiApi.getCachedWellPromise(idWell).then((well) => {
                        let zonesets = well.zone_sets;
                        let hasZonesetName = self.zonesetName != 'ZonationAll' ? zonesets.some(zs => {
                            zs.name == self.zonesetName;
                        }) : true;
                        $timeout(() => {
                            if (!self.wellSpec.find(wsp => wsp.idWell === idWell) && hasZonesetName) {
                                self.wellSpec.push({idWell});
                            } else if (!hasZonesetName) {
                                toastr.error(`User dataset do not have ${self.zonesetName}`);
                            }
                        })
                    }).catch(e => console.error(e));
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
    this.getFilterForWell = (axis) => {
        switch(axis) {
            case 'xAxis':
                return self.getSelectionValue('X').value;
            case 'yAxis':
                return self.getSelectionValue('Y').value;
            case 'z1Axis':
                return self.getSelectionValue('Z1').value;
            case 'z2Axis':
                return self.getSelectionValue('Z2').value;
            case 'z3Axis':
                return self.getSelectionValue('Z3').value;
            default:
        }
    }
    this.runWellMatch = function (node, criteria) {
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

    // ---POLYGON---
    this.currentPolygon = {};
    this.addPolygon = function() {
        let polygon = {};
        polygon.label = 'New polygon';
        polygon.mode = 'edit';
        polygon._notUsed = false;
        polygon._notShow = false;
        polygon.exclude = true;
        polygon.points = [];
        Object.assign(self.currentPolygon, polygon);
        self.polygons.forEach(p => {
            p.mode = null;
        })
        self.polygons.push(polygon);
    }
    this.removePolygon = ($index) => {
        self.polygons.splice($index, 1);
    }
    this.filterByPolygons = function(polygons, data, exclude) {
        let ppoints = polygons.map(function(p) {
            return p.points.map(function(point) {
                return [point.x, point.y];
            });
        });

        return data.filter(function(d) {
            let pass = exclude ? false : true;
            for (let p of ppoints)
                if (d3.polygonContains(p, d))
                    return pass;
            return !pass;
        });
    }
    this.setPolygonLabel = function($index, newLabel) {
        self.polygons[$index].label = newLabel;
    }
    this.toggleEditPolygon = function(polygon) {
        let idx = self.polygons.indexOf(polygon);
        self.polygons.forEach((p, i) => {
            if (i != idx) p.mode = null;
        })
        if (polygon.mode == 'edit') {
            polygon.mode = null;
        } else {
            polygon._notShow = false;
            polygon.mode = 'edit';
        }
    }

    // ---UDL
    this.addUDL = function() {
        let udl = {};
        udl.text = "";
        setUDLFn(udl);
        udl.latex = "";
        udl.lineStyle = {
            lineColor: colorGenerator(),
            lineWidth: 1,
            lineStyle: [10, 0]
        };
        self.udls.push(udl);
    }
    function normalizeFormation(text) {
        return text.replace(/\+-/g, '-').replace(/--/g, '+');
    }
    function setUDLFn(udl) {
        if (!udl.fn) {
            udl.fn = (function(x) {
                //this.value = (selected;ItemProps || {}).name;
                return eval(this.text);
            }).bind(udl);
        }
    }
    this.getFnUDL = function(index) {
        return (self.udls[index].text || '').length ? self.udls[index].text : '[empty]';
    }
    this.setFnUDL = function(index, newValue) {
        self.udls[index].text = newValue;
        self.udls[index].latex = normalizeFormation(`y = ${newValue}`);
    }
    this.getLineStyleUDL = function(index) {
        return (self.udls[index].text || '').length ? self.udls[index].text : '[empty]';
    }
    this.setLineStyleUDL = function(index, newValue) {
        self.udls[index].text = newValue;
    }
    this.getLineWidthUDL = function(index) {
        return (self.udls[index].text || '').length ? self.udls[index].text : '[empty]';
    }
    this.setLineWidthUDL = function(index, newValue) {
        self.udls[index].text = newValue;
    }
    this.getLineColorUDL = function(index) {
        return (self.udls[index].text || '').length ? self.udls[index].text : '[empty]';
    }
    this.setLineColorUDL = function(index, newValue) {
        self.udls[index].text = newValue;
    }
    this.removeUDL = ($index) => {
        self.udls.splice($index, 1);
    }

    // ---LAYER
    this.layers = [];
    this.genLayers = async function() {
        if (!self.isSettingChange) return;
        self.isSettingChange = false;
        self.layers = self.layers || []	;
        let layers = [];
        let _notUsedLayer = [];
        let shouldPlotZ1 = self.getSelectionValue('Z1').isUsed;
        let shouldPlotZ2 = self.getSelectionValue('Z2').isUsed;
        let shouldPlotZ3 = self.getSelectionValue('Z3').isUsed;
        wiLoading.show($element.find('.main')[0]);
        for (let i =0; i < self.treeConfig.length; i++) {
            let well = self.treeConfig[i];
            if (well._notUsed) {
                continue;
            }
            let curveX = self.getCurve(well, 'xAxis');
            let curveY = self.getCurve(well, 'yAxis');
            let curveZ1 = shouldPlotZ1 ? self.getCurve(well, 'z1Axis') : null;
            let curveZ2 = shouldPlotZ2 ? self.getCurve(well, 'z2Axis') : null;
            let curveZ3 = shouldPlotZ3 ? self.getCurve(well, 'z3Axis') : null;
            if (!curveX || !curveY) {
                continue;
            }
            let datasetTopX = self.wellSpec[i].xAxis.datasetTop;
            let datasetBottomX = self.wellSpec[i].xAxis.datasetBottom;
            let datasetStepX = self.wellSpec[i].xAxis.datasetStep;
            let datasetX = well.datasets.find(ds => ds.idDataset === self.wellSpec[i].xAxis.idDataset);

            let datasetTopY = self.wellSpec[i].yAxis.datasetTop;
            let datasetBottomY = self.wellSpec[i].yAxis.datasetBottom;
            let datasetStepY = self.wellSpec[i].yAxis.datasetStep;
            let datasetY = well.datasets.find(ds => ds.idDataset === self.wellSpec[i].yAxis.idDataset);

            let zoneset = getZoneset(well, self.zonesetName);
            zoneset = zoneset || genZonationAllZS(d3.max([datasetTopX, datasetTopY]), d3.min([datasetBottomX, datasetBottomY]), well.color)

            let curveDataX = await wiApi.getCachedCurveDataPromise(curveX.idCurve);
            if (self.hasDiscriminator(well)) {
                let discriminatorCurve = await wiApi.evalDiscriminatorPromise(datasetX, self.wellSpec[i].discriminator);
                curveDataX = curveDataX.filter((d, idx) => discriminatorCurve[idx]);
            }
            let curveDataY = await wiApi.getCachedCurveDataPromise(curveY.idCurve);
            if (self.hasDiscriminator(well)) {
                let discriminatorCurve = await wiApi.evalDiscriminatorPromise(datasetY, self.wellSpec[i].discriminator);
                curveDataY = curveDataY.filter((d, idx) => discriminatorCurve[idx]);
            }
            let curveDataZ1 = null;
            let curveDataZ2 = null;
            let curveDataZ3 = null;
            let datasetZ1 = null;
            let datasetZ2 = null;
            let datasetZ3 = null;
            if (shouldPlotZ1 && curveZ1) {
                datasetZ1 = well.datasets.find(ds => ds.idDataset === self.wellSpec[i].z1Axis.idDataset);
                self.colors = zColors(self.getZ1N(), curveZ1.idCurve);
                curveDataZ1 = await wiApi.getCachedCurveDataPromise(curveZ1.idCurve);
                if (self.hasDiscriminator(well)) {
                    let discriminatorCurve = await wiApi.evalDiscriminatorPromise(datasetZ1, self.wellSpec[i].discriminator);
                    curveDataZ1 = curveDataZ1.filter((d, idx) => discriminatorCurve[idx]);
                }
            }
            if (shouldPlotZ2 && curveZ2) {
                datasetZ2 = well.datasets.find(ds => ds.idDataset === self.wellSpec[i].z2Axis.idDataset);
                self.sizes = zSizes(self.getZ2N(), curveZ2.idCurve);
                curveDataZ2 = await wiApi.getCachedCurveDataPromise(curveZ2.idCurve);
                if (self.hasDiscriminator(well)) {
                    let discriminatorCurve = await wiApi.evalDiscriminatorPromise(datasetZ2, self.wellSpec[i].discriminator);
                    curveDataZ2 = curveDataZ2.filter((d, idx) => discriminatorCurve[idx]);
                }
            }
            if (shouldPlotZ3 && curveZ3) {
                datasetZ3 = well.datasets.find(ds => ds.idDataset === self.wellSpec[i].z3Axis.idDataset);
                self.symbols = zSymbols(self.getZ3N(), curveZ3.idCurve);
                curveDataZ3 = await wiApi.getCachedCurveDataPromise(curveZ3.idCurve);
                if (self.hasDiscriminator(well)) {
                    let discriminatorCurve = await wiApi.evalDiscriminatorPromise(datasetZ3, self.wellSpec[i].discriminator);
                    curveDataZ3 = curveDataZ3.filter((d, idx) => discriminatorCurve[idx]);
                }
            }

            curveDataX = curveDataX
                .map(d => ({
                    ...d,
                    depth: datasetStepX > 0 ? (datasetTopX + d.y * datasetStepX) : d.y
                }));
            let pointset = getPointSet(curveDataX, curveDataY, curveDataZ1, curveDataZ2, curveDataZ3);
            pointset = pointset.filter(ps => {
                return _.isFinite(ps.x) && _.isFinite(ps.y)
                    && (!shouldPlotZ1 || _.isFinite(ps.z1))
                    && (!shouldPlotZ2 || _.isFinite(ps.z2))
                    && (!shouldPlotZ3 || _.isFinite(ps.z3));
            })

            let zones = zoneset.zones.filter(zone => {
                let z = self.zoneTree.find(z1 => {
                    return z1.zone_template.name === zone.zone_template.name;
                });
                zone._notUsed = z._notUsed;
                return true;
            });

            if (self.getColorMode() == 'zone') {
                for (let j = 0; j < zones.length; j++) {
                    let zone = zones[j];
                    let dataArray = filterData(pointset, zone);
                    let layer = {
                        dataX: dataArray.map(d => d.x),
                        dataY: dataArray.map(d => d.y),
                        dataZ1: dataArray.map(d => d.z1),
                        dataZ2: dataArray.map(d => d.z2),
                        dataZ3: dataArray.map(d => d.z3),
                        regColor: self.getColor(zone, well),
                        layerColor: self.getColor(zone, well),
                        name: `${well.name}.${zone.zone_template.name}`,
                        zone: zone.zone_template.name,
                        curveXInfo: `${datasetX.name}.${curveX.name}`,
                        curveYInfo: `${datasetY.name}.${curveY.name}`,
                        curveZ1Info: shouldPlotZ1 ? `${datasetZ1.name}.${curveZ1.name}` : 'N/A',
                        curveZ2Info: shouldPlotZ2 ? `${datasetZ2.name}.${curveZ2.name}` : 'N/A',
                        curveZ3Info: shouldPlotZ3 ? `${datasetZ3.name}.${curveZ3.name}` : 'N/A',
                        numPoints: dataArray.length
                    }
                    layer.color = curveZ1 && shouldPlotZ1 ? (function(data, idx) {
                        return getTransformZ1()(this.dataZ1[idx]);
                    }).bind(layer) : self.getColor(zone, well);
                    layer.size = curveZ2 && shouldPlotZ2 ? (function(data, idx) {
                        return getTransformZ2()(this.dataZ2[idx]);
                    }).bind(layer) : null;
                    layer.textSymbol = curveZ3 && shouldPlotZ3 ? (function(data, idx) {
                        return getTransformZ3()(this.dataZ3[idx]);
                    }).bind(layer) : null;
                    $timeout(() => {
                        if (!zone._notUsed) {
                            layers.push(layer);
                        } else {
                            _notUsedLayer.push(layer)
                        }
                    })
                }
            } else {
                for (let j = 0; j < zones.length; j++) {
                    let zone = zone[j];
                    let layer = {
                        dataX: pointset.map(d => d.x),
                        dataY: pointset.map(d => d.y),
                        dataZ1: pointset.map(d => d.z1),
                        dataZ2: pointset.map(d => d.z2),
                        dataZ3: pointset.map(d => d.z3),
                        regColor: well.color,
                        layerColor: well.color,
                        name: `${well.name}.${zone.zone_template.name}`,
                        zone: zone.zone_template.name,
                        curveXInfo: `${datasetX.name}.${curveX.name}`,
                        curveYInfo: `${datasetY.name}.${curveY.name}`,
                        curveZ1Info: shouldPlotZ1 ? `${datasetZ1.name}.${curveZ1.name}` : 'N/A',
                        curveZ2Info: shouldPlotZ2 ? `${datasetZ2.name}.${curveZ2.name}` : 'N/A',
                        curveZ3Info: shouldPlotZ3 ? `${datasetZ3.name}.${curveZ3.name}` : 'N/A',
                        numPoints: pointset.length
                    }
                    layer.color = curveZ1 && shouldPlotZ1 ? (function(data, idx) {
                        return getTransformZ1()(this.dataZ1[idx]);
                    }).bind(layer) : well.color;
                    layer.size = curveZ2 && shouldPlotZ2 ? (function(data, idx) {
                        return getTransformZ2()(this.dataZ2[idx]);
                    }).bind(layer) : null;
                    layer.textSymbol = curveZ3 && shouldPlotZ3 ? (function(data, idx) {
                        return getTransformZ3()(this.dataZ3[idx]);
                    }).bind(layer) : null;
                    $timeout(() => {
                        if (!zone._notUsed) {
                            layers.push(layer);
                        } else {
                            _notUsedLayer.push(layer)
                        }
                    })
                }
            }
        }

        self.udls.forEach(udl => {
            setUDLFn(udl);
        })
        wiLoading.hide();
        self.layers = layers;
        self._notUsedLayer = _notUsedLayer;
    }
    function getPointSet(xData, yData, z1Data, z2Data, z3Data) {
        let pointset = [];
        xData.forEach((eX, idx) => {
            pointset.push({
                x: eX.x,
                y: yData[idx].x,
                z1: z1Data ? z1Data[idx].x : undefined,
                z2: z2Data ? z2Data[idx].x : undefined,
                z3: z3Data ? z3Data[idx].x : undefined,
                depth: eX.depth
            })
        })
        return pointset;
    }
    function getTransformZ1() {
        let wdZ = [self.getZ1Min(), self.getZ1Max()];
        let reverse = wdZ[0] > wdZ[1];
        return d3.scaleQuantize()
            .domain(sort(wdZ))
            .range(reverse ? clone(self.colors).reverse() : self.colors);
    }
    function getTransformZ2() {
        let wdZ = [self.getZ2Min(), self.getZ2Max()];
        let reverse = wdZ[0] > wdZ[1];
        return d3.scaleQuantize()
            .domain(sort(wdZ))
            .range(reverse ? clone(self.sizes).reverse() : self.sizes);
    }
    function getTransformZ3() {
        let wdZ = [self.getZ3Min(), self.getZ3Max()];
        let reverse = wdZ[0] > wdZ[1];
        return d3.scaleQuantize()
            .domain(sort(wdZ))
            .range(reverse ? clone(self.symbols).reverse() : self.symbols);
    }
    function zColors(numColor, doHaveColorAxis) {
        if (!doHaveColorAxis) return [];
        if (numColor <= 0) return [];
        let colors = [];
        if (numColor == 1) return ['rgb(255, 0, 0)'];
        let rotateTime = Math.round(numColor / 3);
        let redPoints = points(numColor);
        let greenPoints = angular.copy(redPoints).rotate(rotateTime);
        let bluePoints = angular.copy(greenPoints).rotate(rotateTime);
        for (let i = 0; i < numColor; i++) {
            colors.push('rgb(' + redPoints[i] + ',' + greenPoints[i] + ',' + bluePoints[i] + ')');
        }
        return colors;
    }
    function zSizes(numSize, doHaveSizeAxis) {
        if (!doHaveSizeAxis) return [];
        if (numSize <= 0) return [];
        const minSize = 5;
        const step = 2;
        let sizes = []
        for (let i = 0; i < numSize; i++) {
            sizes.push(minSize + i * step);
        }
        return sizes;
    }
    function zSymbols(numSymbol, doHaveSymbolAxis) {
        if (!doHaveSymbolAxis) return [];
        if (numSymbol <= 0) return [];
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let symbols = []
        for (let i = 0; i < numSymbol; i++) {
            symbols.push(alphabet[i]);
        }
        return symbols;
    }
    function points(N) {
        let toRet = [];
        let step = (255 - 0) / (N - 1);
        for (let i = 0; i < N; i++) {
            toRet.push(0 + i * step);
        }
        return toRet;
    }
    function sort(array) {
        return array.sort(function(a, b) {                                          
            return a - b;                                                           
        });                                                                         
    }
    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    if (!Array.prototype.rotate) {
        Object.defineProperty(Array.prototype, 'rotate', {
            enumerable: false,
            value: function (count) {
                var push = Array.prototype.push,
                    splice = Array.prototype.splice;
                var len = this.length >>> 0, // convert to uint
                    count = count >> 0; // convert to int

                // convert count to value in range [0, len)
                count = ((count % len) + len) % len;

                // use splice.call() instead of this.splice() to make function generic
                push.apply(this, splice.call(this, 0, count));
                return this;
            }
        });
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
        self.layers.forEach(bins => bins._notUsed = true);               
        $timeout(() => {});                                                     
    }                                                                           
    this.showAllLayer = function() {                                            
        self.layers.forEach(bins => bins._notUsed = false);              
        $timeout(() => {});                                                     
    }
    this.getFilterForLayer = () => {
        if (!self.zoneTree || !self.zoneTree.length) {
            return '';
        }
        let filterLayer = self.zoneTree.map(z => `${z._notUsed}`).join('');
        return filterLayer;
    }
    this.runLayerMatch = function (node, criteria) {
        let keySearch = criteria.toLowerCase();
        let searchArray = node.name.toLowerCase();
        return searchArray.includes(keySearch);
    }
    let _layerTree = [];
    this.getLayerTree = function() {
        _layerTree = self.layers
        return self.layers;
    }
    this.getLayerLabel = (node) => node.name
    this.getLayerIcon = (node) => ( (node && !node._notUsed) ? 'layer-16x16': 'fa fa-eye-slash' )
    this.getLayerIcons = (node) => ( ["rectangle"] )
    this.getLayerIconStyle = (node) => ( {
        'background-color': node.layerColor
    })
    this.click2ToggleLayer = function ($event, node, selectedObjs) {
        node._notUsed = !node._notUsed;
        self.selectedLayers = Object.values(selectedObjs).map(o => o.data);
    }

    // ---REGRESSION---
    function getRegressionTypeList() {
        self.regressionTypeList = [{
            data: {label: 'Linear'},
            properties: {name: 'Linear'}
        }, {
            data: {label: 'Exponential'},
            properties: {name: 'Exponential'}
        }, {
            data: {label: 'Power'},
            properties: {name: 'Power'}
        }]
    }
    this.onRegressionTypeChange = function(selectedItemProps) {
        self.regressionType = (selectedItemProps || {}).name;
    }
    this.getRegIcon = (node) => ( (node && node._useReg) ? 'layer-16x16': 'fa fa-eye-slash' )
    this.getRegIcons = (node) => ( ["rectangle"] )
    this.getRegIconStyle = (node) => ( {
        'background-color': node.regColor
    })
    this.updateRegressionLine = function(node, regressionType, polygons) {
        let data = [];
        for (let i = 0; i < self.layers.length; i++) {
            let layer = self.layers[i];
            if (layer._useReg) {
                data = data.concat(layer.dataX.map((x, i) => {
                    return [x, layer.dataY[i]];
                }));
            }
        }
        let usedPolygon = polygons.filter(p => {
            return !_.isEmpty(p.points) && !p._notUsed;
        })
        if (usedPolygon.length) {
            data = self.filterByPolygons(usedPolygon, data, self.polygonExclude);
        }
        let result;
        switch(regressionType) {
            case 'Linear':
                result = regression.linear(data, {precision: 6});
                self.regLine = {
                    ...self.regLine,
                    family: self.regressionType.toLowerCase(), 
                    slope: result.equation[0], 
                    intercept: result.equation[1],
                };
                break;
            case 'Exponential':
                result = regression.exponential(data, {precision: 6});
                self.regLine = {
                    ...self.regLine,
                    family: self.regressionType.toLowerCase(), 
                    ae: result.equation[0], 
                    b: result.equation[1],
                };
                break;
            case 'Power':
                result = regression.power(data, {precision: 6});
                self.regLine = {
                    ...self.regLine,
                    family: self.regressionType.toLowerCase(), 
                    coefficient: result.equation[0], 
                    exponent: result.equation[1],
                };
                break;
        }
    }
    this.click2ToggleRegression = function ($event, node, selectedObjs) {
        node._useReg = !node._useReg;
        self.updateRegressionLine(node, self.regressionType, self.polygons);
        $timeout(() => {
            self.regLine = {
                ...self.regLine,
                lineStyle: [10, 0],
                lineColor: self.regLine.lineColor ? self.regLine.lineColor : colorGenerator(),
                lineWidth: 1
            };
        })
    }

    //---DISCRIMINATOR---
    this.discriminatorDialog = function(well) {
        let wSpec = getWellSpec(well);
        let dataset = well.datasets.find(ds => ds.idDataset === wSpec['xAxis'].idDataset);

        let curvesArr = dataset.curves.map( c => ({type:'curve',name:c.name}) );
        wiDialog.discriminator(wSpec.discriminator, curvesArr, function(discrmnt) {
            wSpec.discriminator = discrmnt;
        });
    }                                                                           
    this.hasDiscriminator = function(well) {
        let wSpec = getWellSpec(well);
        return wSpec.discriminator && Object.keys(wSpec.discriminator).length > 0 && wSpec.discriminator.active;
    }

    this.reverseAxis = function() {
        [self.selectionValueList[0].value, self.selectionValueList[1].value] = [self.selectionValueList[1].value, self.selectionValueList[0].value];
        for (let i = 0; i < self.wellSpec.length; i++) {
            swapPropObj(self.wellSpec[i], 'xAxis', 'yAxis');
        }
        updateDefaultConfig();
        [self.config.left, self.config.bottom] = [self.config.bottom, self.config.left];
        [self.config.right, self.config.top] = [self.config.top, self.config.right];
        [self.config.logaX, self.config.logaY] = [self.config.logaY, self.config.logaX];
        [self.config.majorX, self.config.majorY] = [self.config.majorY, self.config.majorX];
        [self.config.minorX, self.config.minorY] = [self.config.minorY, self.config.minorX];
        [self.config.xLabel, self.config.yLabel] = [self.config.yLabel, self.config.xLabel];
        self.genLayers();
    }
    function swapPropObj(obj, key1, key2) {
        [obj[key1], obj[key2]] = [obj[key2], obj[key1]];
    }

    function colorGenerator() {
        let rand = function () {
            return Math.floor(Math.random() * 255);
        }
        return "rgb(" + rand() + "," + rand() + "," + rand() + ")";
    }
}
