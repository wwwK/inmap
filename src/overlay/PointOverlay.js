/**
 * Copyright(C),2019-2029,www.jszcrj.com
 * Author: org_hejianhui@163.com
 * Date: 2019.01.29
 * Version: 0.0.1
 * Description: 散点图层组件，以散点的方式标注地理位置，可配置散点大小、背景颜色、边框宽度、边框颜色、以及鼠标事件等
 */
import CanvasOverlay from './base/CanvasOverlay.js';    // 图层绘制类
import Label from './../worker/helper/Label';
import Parameter from './base/Parameter';   // 参数解析类
import {
    isEmpty,    // 是否为空
    detectmob,  // 检查设备类型
} from '../common/Util.js';
import BatchesData from './base/BatchesData';   // 数据分批间断执行
import PointConfig from '../config/PointConfig';    // 默认散点参数结构
import State from './../config/OnStateConfig';  // 绘制状态
let isMobile = detectmob(); // 是否是移动设备

export default class PointOverlay extends Parameter {
    constructor(opts) {
        super(PointConfig, opts);
        this._loopDraw = this._loopDraw.bind(this);
        if (!isEmpty(this._option.draw)) {
            this._batchesData = new BatchesData(this._option.draw);
        }
        this._mouseLayer = new CanvasOverlay({
            zIndex: this._zIndex + 1
        });
        this._state = null;
        this._mpp = {};
    }

    /**
     * 初始化图例
     */
    _initLegend() {
        if (this._styleConfig.splitList.length === 0 && this._styleConfig.colors.length > 0) {
            this._compileSplitList(this._getTransformData());
        } else {
            this._setlegend(this._legendConfig, this._styleConfig.splitList);
        }

    }

    /**
     * 设置当前的图层的z-index值。注意：被and添加之后才能调用生效,zcmap默认是按照添加图层的顺序设置层级的
     * @param {Nubmer} zIndex 图层索引
     */
    setZIndex(zIndex) {
        this._zIndex = zIndex;
        if (this._container) this._container.style.zIndex = this._zIndex;

        this._mouseLayer.setZIndex(this._zIndex + 1);
    }

    /**
     * 样式发生变化会触发
     */
    _onOptionChange() {
        this._map && this._initLegend();
    }

    /**
     * 样式发生变化会触发
     */
    _onDataChange() {
        this._map && this._initLegend();
    }

    /**
     * 参数初始化
     */
    _parameterInit() {
        this._map.addOverlay(this._mouseLayer);
        this._initLegend();
    }

    /**
     * 设置选中数据
     * @param {Object} ops 选择数据项
     */
    setOptionStyle(ops) {
        this._setStyle(this._option, ops);
        if (!isEmpty(this._option.draw)) {
            this._batchesData = new BatchesData(this._option.draw);
        } else {
            this._batchesData = null;
        }
    }

    /**
     * 设置绘制状态
     * @param {*} val 
     */
    _setState(val) {
        this._state = val;
        this._eventConfig.onState.call(this, this._state);
    }

    /**
     * 绘制当前图层
     */
    _toDraw() {
        this._drawMap();
    }
    
    /**
     * 计算像素
     */
    _calculateMpp(size) {
        let normal = this._styleConfig.normal,
            result;
        if (normal.unit == 'px') {
            result = size;
        } else if (normal.unit == 'm') {
            let zoom = this._map.getZoom();
            let mpp;
            if (this._mpp[zoom]) {
                mpp = this._mpp[zoom];
            } else {
                this._mpp[zoom] = this._getMpp();
                mpp = this._mpp[zoom];
            }
            if (mpp == 0 || isNaN(mpp)) {
                return;
            }
            result = size / mpp;
        } else {
            throw new TypeError('zcMap: style.normal.unit must be is "m" or "px" .');
        }
        return result;
    }
    
    /**
     * 获得每个像素对应多少米	
     */
    _getMpp() {
        let mapCenter = this._map.getCenter();
        let assistValue = 10;
        let cpt = new BMap.Point(mapCenter.lng, mapCenter.lat + assistValue);
        let dpx = Math.abs(this._map.pointToPixel(mapCenter).y - this._map.pointToPixel(cpt).y);
        return this._map.getDistance(mapCenter, cpt) / dpx;
    }

	 /**
     * 数据偏移转化
     * @param {*} distanceX X轴偏移
     * @param {*} distanceY Y轴偏移
     */
    _translation(distanceX, distanceY) {
        if (this._batchesData && !this._batchesData.usable) return;
        for (let i = 0; i < this._workerData.length; i++) {
            let pixel = this._workerData[i].geometry.pixel;
            pixel.x = pixel.x + distanceX;
            pixel.y = pixel.y + distanceY;
        }

        this.refresh();
    }
    
    /**
     * 重新绘制
     */
    _drawMouseLayer() {
        let overArr = this._overItem ? [this._overItem] : [];
        this._mouseLayer._clearCanvas();
        this._loopDraw(this._mouseLayer._getContext(), this._selectItem.concat(overArr), true);

    }
    
    /**
     * 清空所有
     */
    _clearAll() {
        this._mouseLayer._clearCanvas();
        this._clearCanvas();
    }
    
     /**
     * 重新绘制图层对象
     */
    _drawMap() {
        if (this._batchesData) {
            this._batchesData.clear();
            this._batchesData.setUsable(false);
        }


        this._clearAll();
        this._setState(State.computeBefore);
        this._postMessage('HeatOverlay.pointsToPixels', this._getTransformData(), (pixels, margin, zoom) => {

            this._setState(State.conputeAfter);
            this._setWorkerData(pixels);
            this._updateOverClickItem();

            if (this._batchesData) {
                this._batchesData.setUsable(true);
            }
            if (this._map.getZoom() == zoom) {
                this._translation(margin.left - this._margin.left, margin.top - this._margin.top);
            } else {
                this._translation(0, 0);
            }
            margin = null;
            pixels = null;

        });
    }
    
     /**
     * 更新图层对象内容
     */
    _updateOverClickItem() {
        let overArr = this._overItem ? [this._overItem] : [];
        let allItems = this._selectItem.concat(overArr);

        for (let i = 0; i < allItems.length; i++) {
            let item = allItems[i];
            let ret = this._workerData.find(function (val) {
                let itemCoordinates = item.geometry.coordinates;
                let valCoordinates = val.geometry.coordinates;
                return val && itemCoordinates[0] == valCoordinates[0] && itemCoordinates[1] == valCoordinates[1] && val.count == item.count;
            });
            item.geometry.pixel = ret.geometry.pixel;
        }
    }
    
    /**
     * 颜色等分策略
     * @param {} data 
     */
    _compileSplitList(data) {
        let colors = this._styleConfig.colors;
        if (colors.length <= 0) return;
        data = data.sort((a, b) => {
            return parseFloat(a.count) - parseFloat(b.count);
        });
        let splitCount = data.length / colors.length;
        let colorIndex = 0;
        let split = [];
        let star = 0,
            end = 0;

        for (let i = 0; i < data.length; i++) {

            if (i > splitCount * (colorIndex + 1)) {
                if (split.length == 0) {
                    star = data[0].count;
                }

                end = data[i].count;

                split.push({
                    start: star,
                    end: end,
                    backgroundColor: colors[colorIndex],
                });
                colorIndex++;
                star = data[i].count;
            }
        }

        data.length > 0 && split.push({
            start: star,
            end: null,
            backgroundColor: colors[colorIndex],
        });




        let result = [];
        for (let i = 0; i < split.length; i++) {
            let item = split[i];
            if (item.start != item.end) {
                item.backgroundColor = colors[result.length];
                result.push(item);
            }
        }

        this._styleConfig.splitList = result;
        this._setlegend(this._legendConfig, this._styleConfig.splitList);
    }

	/**
     * 根据鼠标像素坐标获取数据项
     * @param {*} mouseX 
     * @param {*} mouseY 
     */
    _getTarget(mouseX, mouseY) {
        let pixels = this._workerData,
            ctx = this._ctx;
        let mapSize = this._map.getSize();
        for (let i = 0, len = pixels.length; i < len; i++) {
            let item = pixels[i];
            let {
                x,
                y,
            } = item.geometry.pixel;
            let style = this._setDrawStyle(item, false, i);
            let size = this._calculateMpp(style.size);
            size += style.borderWidth || 0;
            if (x > -size && y > -size && x < mapSize.width + size && y < mapSize.height + size) {
                ctx.beginPath();
                ctx.arc(x, y, size, 0, 2 * Math.PI, true);
                if (ctx.isPointInPath(mouseX * this._devicePixelRatio, mouseY * this._devicePixelRatio)) {
                    return {
                        index: i,
                        item: item
                    };
                }
            }
        }
        return {
            index: -1,
            item: null
        };
    }
    
    /**
     * 查询选中列表的索引
     * @param {*} item 
     */
    _findIndexSelectItem(item) {
        let index = -1;
        if (item) {
            index = this._selectItem.findIndex(function (val) {
                let itemCoordinates = item.geometry.coordinates;
                let valCoordinates = val.geometry.coordinates;
                return val && itemCoordinates[0] == valCoordinates[0] && itemCoordinates[1] == valCoordinates[1] && val.count == item.count;
            });
        }
        return index;
    }
    
    /**
     * 刷新图层对象
     */
    refresh() {
        this._setState(State.drawBefore);
        this._clearCanvas();
        this._mouseLayer._canvasResize();
        if (this._batchesData) {
            this._batchesData.clear();
            this._batchesData.action(this._workerData, this._loopDraw, this._ctx);

        } else {
            this._loopDraw(this._ctx, this._workerData, false);
        }
        if (this._styleConfig.normal.label.show) {
            this._drawLabel(this._ctx, this._workerData);
        }
        this._drawMouseLayer();
        this._setState(State.drawAfter);
    }
    
     /**
     * 变量交换
     * @param {*} index 
     * @param {*} item 
     */
    _swopData(index, item) {
        if (index > -1 && !this._styleConfig.normal.label.show) { //导致文字闪
            this._workerData[index] = this._workerData[this._workerData.length - 1];
            this._workerData[this._workerData.length - 1] = item;
        }
    }
    
    /**
     * 绘制点
     * @param {*} ctx 上下文
     * @param {*} pixels 数据集
     * @param {*} otherMode 是否绘画选中数据
     */
    _loopDraw(ctx, pixels, otherMode) {
        let mapSize = this._map.getSize();
        for (let i = 0, len = pixels.length; i < len; i++) {
            let item = pixels[i];
            let pixel = item.geometry.pixel;
            let {
                x,
                y
            } = pixel;

            //重构
            let style = this._setDrawStyle(item, otherMode, i);
            let size = this._calculateMpp(style.size);
            if (this._styleConfig.normal.label.show) {
                pixel['radius'] = size;
            }
            if (x > -size && y > -size && x < mapSize.width + size && y < mapSize.height + size) {
                if (style.shadowColor) {
                    ctx.shadowColor = style.shadowColor || 'transparent';
                    ctx.shadowBlur = style.shadowBlur || 10;
                } else {
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                }
                if (style.globalCompositeOperation) {
                    ctx.globalCompositeOperation = style.globalCompositeOperation;
                }
                this._drawCircle(ctx, x, y, size, style.backgroundColor, style.borderWidth, style.borderColor);
            }
        }
    }
    
    /**
     * 绘制标记文字
     * @param {*} ctx 上下文对象
     * @param {*} pixels 数据集
     */
    _drawLabel(ctx, pixels) {
        let fontStyle = this._styleConfig.normal.label;
        let fontSize = parseInt(fontStyle.font);
        ctx.font = fontStyle.font;
        ctx.textBaseline = 'top';
        ctx.fillStyle = fontStyle.color;
        let byteWidth = ctx.measureText('a').width;

        // let param = {
        //     pixels: pixels,
        //     height: fontSize,
        //     borderWidth: this._styleConfig.normal.borderWidth,
        //     byteWidth: byteWidth
        // };
        // this._postMessage('LablEvading.merge', param, (labels) => {
        //     if (this._eventType == 'onmoving') {
        //         return;
        //     }
        //     labels.forEach(function (item) {
        //         ctx.beginPath();
        //         ctx.fillText(item.text, item.x, item.y);
        //         ctx.fill();
        //     });
        // });
        let isName = true;
        let labels = pixels.map((val) => {
            let {
                radius,
                x,
                y
            } = val.geometry.pixel;
            let r = radius + this._styleConfig.normal.borderWidth;
            isName = val.name ? true : false;
            return new Label(x, y, r, fontSize, byteWidth, val.name);
        });
        if (!isName) return;

        //x排序从小到大
        labels.sort((a, b) => {
            return b.x - a.x;
        });
        let meet;

        do {
            meet = false; //本轮是否有相交
            for (let i = 0; i < labels.length; i++) {
                let temp = labels[i];
                for (let j = 0; j < labels.length; j++) {
                    let temp2 = labels[j];
                    if (temp2 != temp && temp.show && temp.isAnchorMeet(temp2)) {
                        temp.next();
                        meet = true;
                        break;
                    }
                }
            }
        } while (meet);

        //排序 x 从小到大
        //逐一遍历  判断是否相交 就移动label文字方位 当都不满足时隐藏当前label  
        labels.forEach(function (item) {
            if (item.show) {
                let pixel = item.getCurrentRect();
                ctx.beginPath();
                ctx.fillText(item.text, pixel.x, pixel.y);
                ctx.fill();
            }
        });
    }
    
    /**
     * 绘制圆
     * @param {*} ctx 上下文对象
     * @param {*} pixels 数据集
     */
    _drawCircle(ctx, x, y, radius, color, lineWidth, strokeStyle) {
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(x, y, radius, 0, 2 * Math.PI, true);
        ctx.fill();
        if (lineWidth) {
            ctx.lineWidth = lineWidth;
            if (strokeStyle) {
                ctx.strokeStyle = strokeStyle;
            }
            ctx.stroke();
        }
    }
    
    /**
     * 数据释放
     */
    _Tdispose() {
        this._batchesData && this._batchesData.clear();
        this._map.removeOverlay(this._mouseLayer);
        this._mouseLayer.dispose();
    }
    
    /**
     * 鼠标移动
     */
    _tMousemove(event) {

        if (this._eventType == 'onmoving') {
            return;
        }
        if (!this._tooltipConfig.show && isEmpty(this._styleConfig.mouseOver)) {
            return;
        }
        let result = this._getTarget(event.pixel.x, event.pixel.y);
        let temp = result.item;

        if (temp != this._overItem) { //防止过度重新绘画
            this._overItem = temp;
            this._eventType = 'mousemove';
            if (!isEmpty(this._styleConfig.mouseOver)) {
                this._drawMouseLayer();
            }
        }
        if (temp) {
            this._map.setDefaultCursor('pointer');
        } else {
            this._map.setDefaultCursor('default');
        }

        this._setTooltip(event);

    }
    
     /**
     * 鼠标点击
     */
    _tMouseClick(event) {
        if (this._eventType == 'onmoving') return;
        let {
            multiSelect
        } = this._eventConfig;
        let result = this._getTarget(event.pixel.x, event.pixel.y);
        if (result.index == -1) {
            return;
        }

        let item = result.item;
        if (multiSelect) {
            if (this._selectItemContains(item)) {
                this._deleteSelectItem(item); //二次点击取消选中
            } else {
                this._selectItem.push(result.item);
            }

        } else {
            this._selectItem = [result.item];
        }

        this._eventConfig.onMouseClick(this._selectItem, event);


        if (isMobile) {
            this._overItem = item;
            this._setTooltip(event);
        }
        this._drawMouseLayer();


    }
}