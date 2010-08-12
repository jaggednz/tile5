SLICK.Tiling = (function() {
    TileStore = function(params) {
        // initialise the parameters with the defaults
        params = GRUNT.extend({
            gridSize: 20,
            center: new SLICK.Vector(),
            onPopulate: null
        }, params);
        
        // initialise the storage array
        var storage = new Array(Math.pow(params.gridSize, 2)),
            gridHalfWidth = Math.ceil(params.gridSize >> 1),
            topLeftOffset = SLICK.V.offset(params.center, -gridHalfWidth),
            lastTileCreator = null,
            tileShift = new SLICK.Vector(),
            lastNotifyListener = null;
        
        function getTileIndex(col, row) {
            return (row * params.gridSize) + col;
        } // getTileIndex
        
        function copyStorage(dst, src, delta) {
            // set the length of the destination to match the source
            dst.length = src.length;

            for (var xx = 0; xx < params.gridSize; xx++) {
                for (var yy = 0; yy < params.gridSize; yy++) {
                    dst[getTileIndex(xx, yy)] = self.getTile(xx + delta.x, yy + delta.y);
                } // for
            } // for
        } // copyStorage
        
        // initialise self
        var self = {
            getGridSize: function() {
                return params.gridSize;
            },
            
            getNormalizedPos: function(col, row) {
                return SLICK.V.add(new SLICK.Vector(col, row), SLICK.V.invert(topLeftOffset), tileShift);
            },
            
            getTileShift: function() {
                return SLICK.V.copy(tileShift);
            },
            
            getTile: function(col, row) {
                return (col >= 0 && col < params.gridSize) ? storage[getTileIndex(col, row)] : null;
            },
            
            setTile: function(col, row, tile) {
                storage[getTileIndex(col, row)] = tile;
            },
            
            /*
            What a cool function this is.  Basically, this goes through the tile
            grid and creates each of the tiles required at that position of the grid.
            The tileCreator is a callback function that takes a two parameters (col, row) and
            can do whatever it likes but should return a Tile object or null for the specified
            column and row.
            */
            populate: function(tileCreator, notifyListener) {
                // take a tick count as we want to time this
                var startTicks = GRUNT.Log.getTraceTicks(),
                    tileIndex = 0,
                    centerPos = new SLICK.Vector(params.gridSize * 0.5, params.gridSize * 0.5);
                
                if (tileCreator) {
                    for (var row = 0; row < params.gridSize; row++) {
                        for (var col = 0; col < params.gridSize; col++) {
                            if (! storage[tileIndex]) {
                                var tile = tileCreator(col, row, topLeftOffset, params.gridSize);

                                // add the tile to storage
                                storage[tileIndex] = tile;
                            } // if
                            
                            // increment the tile index
                            tileIndex++;
                        } // for
                    } // for
                } // if
                
                // save the last tile creator
                lastTileCreator = tileCreator;
                lastNotifyListener = notifyListener;

                // log how long it took
                GRUNT.Log.trace("tile grid populated", startTicks);
                
                // if we have an onpopulate listener defined, let them know
                if (params.onPopulate) {
                    params.onPopulate();
                } // if
            },
            
            getShiftDelta: function(topLeftX, topLeftY, cols, rows) {
                // initialise variables
                var shiftAmount = Math.floor(params.gridSize * 0.2),
                    shiftDelta = new SLICK.Vector();
                    
                // test the x
                if (topLeftX < 0 || topLeftX + cols > params.gridSize) {
                    shiftDelta.x = topLeftX < 0 ? -shiftAmount : shiftAmount;
                } // if

                // test the y
                if (topLeftY < 0 || topLeftY + rows > params.gridSize) {
                    shiftDelta.y = topLeftY < 0 ? -shiftAmount : shiftAmount;
                } // if
                
                return shiftDelta;
            },
            
            
            shift: function(shiftDelta, shiftOriginCallback) {
                // if the shift delta x and the shift delta y are both 0, then return
                if ((shiftDelta.x === 0) && (shiftDelta.y === 0)) { return; }
                
                var ii, startTicks = GRUNT.Log.getTraceTicks();
                // GRUNT.Log.info("need to shift tile store grid, " + shiftDelta.x + " cols and " + shiftDelta.y + " rows.");

                // create new storage
                var newStorage = Array(storage.length);

                // copy the storage from given the various offsets
                copyStorage(newStorage, storage, shiftDelta);

                // update the storage and top left offset
                storage = newStorage;

                // TODO: check whether this is right or not
                if (shiftOriginCallback) {
                    topLeftOffset = shiftOriginCallback(topLeftOffset, shiftDelta);
                }
                else {
                    topLeftOffset = SLICK.V.add(topLeftOffset, shiftDelta);
                } // if..else

                // create the tile shift offset
                tileShift.x += (-shiftDelta.x * params.tileSize);
                tileShift.y += (-shiftDelta.y * params.tileSize);
                GRUNT.Log.trace("tile storage shifted", startTicks);

                // populate with the last tile creator (crazy talk)
                self.populate(lastTileCreator, lastNotifyListener);
            },
            
            /*
            The setOrigin method is used to tell the tile store the position of the center tile in the grid
            */
            setOrigin: function(col, row) {
                if (! tileOrigin) {
                    topLeftOffset = SLICK.V.offset(new SLICK.Vector(col, row), -tileHalfWidth);
                }
                else {
                    shiftOrigin(col, row);
                } // if..else
            }
        };
        
        GRUNT.WaterCooler.listen("imagecache.cleared", function(args) {
            // reset all the tiles loaded state
            for (var ii = storage.length; ii--; ) {
                if (storage[ii]) {
                    storage[ii].loaded = false;
                } // if
            } // for
        });
        
        return self;
    };

    // initialise variables
    var emptyTile = null,
        panningTile = null;
    
    function getEmptyTile() {
        if (! emptyTile) {
            emptyTile = document.createElement('canvas');
            emptyTile.width = module.Config.TILESIZE;
            emptyTile.height = module.Config.TILESIZE;
            
            var tileContext = emptyTile.getContext('2d');
            
            tileContext.fillStyle = "rgba(150, 150, 150, 0.05)";
            tileContext.fillRect(0, 0, emptyTile.width, emptyTile.height);
        } // if
        
        return emptyTile;
    } // getEmptyTile
    
    function getPanningTile() {
        if (! panningTile) {
            panningTile = document.createElement('canvas');
            panningTile.width = module.Config.TILESIZE;
            panningTile.height = module.Config.TILESIZE;
            
            var tileContext = panningTile.getContext('2d'),
                lineDiff = Math.sqrt(module.Config.TILESIZE);
            
            tileContext.fillStyle = "rgba(200, 200, 200, 1)";
            tileContext.strokeStyle = "rgb(190, 190, 190)";
            tileContext.lineWidth = 0.5;
            tileContext.fillRect(0, 0, panningTile.width, panningTile.height);
            
            // draw the tile background
            tileContext.beginPath();
            for (var xx = 0; xx < panningTile.width; xx += lineDiff) {
                tileContext.moveTo(xx, 0);
                tileContext.lineTo(xx, panningTile.height);
                
                for (var yy = 0; yy < panningTile.height; yy += lineDiff) {
                    tileContext.moveTo(0, yy);
                    tileContext.lineTo(panningTile.width, yy);
                }
            } // for
            tileContext.stroke();
        } // if
        
        return panningTile;
    } // getLoadingTile
    
    // define the module
    var module = {
        // define the tiler config
        Config: {
            TILESIZE: 256,
            // TODO: put some logic in to determine optimal buffer size based on connection speed...
            TILEBUFFER: 1,
            TILEBUFFER_LOADNEW: 0.2
        },
        
        Tile: function(params) {
            params = GRUNT.extend({
                x: 0,
                y: 0,
                size: 256
            }, params);
            
            return params;
        },
        
        ImageTile: function(params) {
            // initialise parameters with defaults
            params = GRUNT.extend({
                url: "",
                sessionParamRegex: null,
                loaded: false
            }, params);
            
            return new module.Tile(params);
        },
        
        TileGrid: function(params) {
            // extend the params with the defaults
            params = GRUNT.extend({
                tileSize: SLICK.Tiling.Config.TILESIZE,
                drawGrid: false,
                center: new SLICK.Vector(),
                shiftOrigin: null,
                supportFastDraw: true,
                checkChange: 100
            }, params);
            
            // create the tile store
            var tileStore = new TileStore(GRUNT.extend({
                onPopulate: function() {
                    gridDirty = true;
                    self.wakeParent();
                }
            }, params));
            
            // initialise varibles
            var halfTileSize = Math.round(params.tileSize >> 1),
                invTileSize = params.tileSize ? 1 / params.tileSize : 0,
                lastOffset = null,
                gridDirty = false,
                active = true,
                tileDrawQueue = [],
                loadedTileCount = 0,
                lastCheckOffset = new SLICK.Vector(),
                shiftDelta = new SLICK.Vector(),
                reloadTimeout = 0,
                gridHeightWidth = tileStore.getGridSize() * params.tileSize;
            
            function updateDrawQueue(context, offset, dimensions, view) {
                // calculate offset change since last draw
                var offsetChange = lastOffset ? SLICK.V.absSize(SLICK.V.diff(lastOffset, offset)) : halfTileSize;
                
                // TODO: optimize
                if (offsetChange >= 20) {
                    var tile, tileShift = tileStore.getTileShift(),
                        tileStart = new SLICK.Vector(
                                        Math.floor((offset.x + tileShift.x) * invTileSize), 
                                        Math.floor((offset.y + tileShift.y) * invTileSize)),
                        tileCols = Math.ceil(dimensions.width * invTileSize) + 1,
                        tileRows = Math.ceil(dimensions.height * invTileSize) + 1,
                        centerPos = new SLICK.Vector((tileCols-1) * 0.5, (tileRows-1) * 0.5),
                        tileOffset = new SLICK.Vector((tileStart.x * params.tileSize), (tileStart.y * params.tileSize)),
                        viewAnimating = view.isAnimating();
                    
                    // reset the tile draw queue
                    tileDrawQueue = [];
                    tilesNeeded = false;
                
                    // right, let's draw some tiles (draw rows first)
                    for (var yy = tileRows; yy--; ) {
                        // initialise the y position
                        var yPos = yy * params.tileSize + tileOffset.y;

                        // iterate through the columns and draw the tiles
                        for (var xx = tileCols; xx--; ) {
                            // get the tile
                            tile = tileStore.getTile(xx + tileStart.x, yy + tileStart.y);
                            var xPos = xx * params.tileSize + tileOffset.x,
                                centerDiff = new SLICK.Vector(xx - centerPos.x, yy - centerPos.y);
                        
                            if (! tile) {
                                shiftDelta = tileStore.getShiftDelta(tileStart.x, tileStart.y, tileCols, tileRows);
                            } // if
                        
                            // add the tile and position to the tile draw queue
                            tileDrawQueue.push({
                                tile: tile,
                                coordinates: new SLICK.Vector(xPos, yPos),
                                centerness: SLICK.V.absSize(centerDiff)
                            });
                        } // for
                    } // for
                
                    // sort the tile queue by "centerness"
                    tileDrawQueue.sort(function(itemA, itemB) {
                        return itemB.centerness - itemA.centerness;
                    });
                    
                    lastOffset = SLICK.V.copy(offset);
                } // if
            } // updateDrawQueue
            
            // initialise self
            var self = GRUNT.extend(new SLICK.Graphics.ViewLayer(params), {
                gridDimensions: new SLICK.Dimensions(gridHeightWidth, gridHeightWidth),
                
                cycle: function(tickCount, offset) {
                    var needTiles = shiftDelta.x + shiftDelta.y !== 0,
                        changeCount = 0;

                    if (needTiles) {
                        tileStore.shift(shiftDelta, params.shiftOrigin);

                        // reset the delta
                        shiftDelta = new SLICK.Vector();
                        
                        // things need to happen
                        changeCount++;
                    } // if
                    
                    // if the grid is dirty let the calling view know
                    return changeCount + gridDirty ? 1 : 0;
                },
                
                deactivate: function() {
                    active = false;
                },
                
                drawTile: function(context, tile, x, y, state) {
                },
                
                draw: function(context, offset, dimensions, state, view) {
                    if (! active) { return; }
                    
                    // initialise variables
                    var startTicks = GRUNT.Log.getTraceTicks(),
                        tileShift = tileStore.getTileShift(),
                        xShift = offset.x + tileShift.x,
                        yShift = offset.y + tileShift.y;

                    if (state !== SLICK.Graphics.DisplayState.PINCHZOOM) {
                        updateDrawQueue(context, offset, dimensions, view);
                        GRUNT.Log.trace("updated draw queue", startTicks);
                    } // if

                    // set the context stroke style for the border
                    if (params.drawGrid) {
                        context.strokeStyle = "rgba(50, 50, 50, 0.3)";
                    } // if

                    // begin the path for the tile borders
                    context.beginPath();

                    // iterate through the tiles in the draw queue
                    for (var ii = tileDrawQueue.length; ii--; ) {
                        var tile = tileDrawQueue[ii].tile,
                            x = tileDrawQueue[ii].coordinates.x - xShift,
                            y = tileDrawQueue[ii].coordinates.y - yShift;

                        // if the tile is loaded, then draw, otherwise load
                        if (tile) {
                            // draw the tile
                            self.drawTile(context, tile, x, y, state);
                            
                            // update the tile position
                            tile.x = x;
                            tile.y = y;
                        } // if

                        // if we are drawing borders, then draw that now
                        if (params.drawGrid) {
                            context.rect(x, y, params.tileSize, params.tileSize);
                        } // if
                    } // for

                    // draw the borders if we have them...
                    context.stroke();
                    GRUNT.Log.trace("drawn tiles", startTicks);                        
                    
                    // flag the grid as not dirty
                    gridDirty = false;
                },
                
                getTileSize: function() {
                    return params.tileSize;
                },
                
                getTileVirtualXY: function(col, row, getCenter) {
                    // get the normalized position from the tile store
                    var pos = tileStore.getNormalizedPos(col, row),
                        fnresult = new SLICK.Vector(pos.x * params.tileSize, pos.y * params.tileSize);
                    
                    if (getCenter) {
                        fnresult.x += halfTileSize;
                        fnresult.y += halfTileSize;
                    } // if
                    
                    return fnresult;
                },
                
                getCenterXY: function() {
                    // get the center column and row index
                    var midIndex = Math.ceil(tileStore.getGridSize() >> 1);
                    
                    return self.getTileVirtualXY(midIndex, midIndex, true);
                },
                
                populate: function(tileCreator) {
                    tileStore.populate(tileCreator, function(tile) {
                    });
                }
            });
            
            // listen for tiles loading
            GRUNT.WaterCooler.listen("tile.loaded", function(args) {
                gridDirty = true;
                self.wakeParent();
            });
            
            return self;
        },
        
        ImageTileGrid: function(params) {
            params = GRUNT.extend({
                
            }, params);
            
            function handleImageLoad(loadedImage, fromCache) {
                GRUNT.WaterCooler.say("tile.loaded");
            } // handleImageLoad
            
            var self = GRUNT.extend(new module.TileGrid(params), {
                drawTile: function(context, tile, x, y, state) {
                    var image = SLICK.Resources.getImage(tile.url);
                    
                    // TODO: remove this for performance but work out how to make remove problem areas
                    if (state === SLICK.Graphics.DisplayState.PAN) {
                        context.drawImage(getPanningTile(), x, y);
                    } // if

                    if (image && image.complete && (image.width > 0)) {
                        context.drawImage(image, x, y);
                    }
                    else {
                        context.drawImage(getEmptyTile(), x, y);
                        
                        // load the image if not loaded
                        if (! image) {
                            SLICK.Resources.loadImage(tile.url, handleImageLoad);
                        } // if
                    } // if..else
                }
            });
            
            return self;
        },
        
        Tiler: function(params) {
            params = GRUNT.extend({
                container: "",
                drawCenter: false,
                onPan: null,
                onPanEnd: null,
                tapHandler: null,
                doubleTapHandler: null,
                zoomHandler: null,
                onDraw: null,
                datasources: {},
                tileLoadThreshold: "first"
            }, params);
            
            // initialise layers
            var gridIndex = 0;
            var lastTileLayerLoaded = "";
            var actualTileLoadThreshold = 0;
            
            var tileCountLoaderFns = {
                first: function(tileCount) {
                    return 1;
                },
                auto: function(tileCount) {
                    return tileCount >> 1;
                },
                
                all: function(tileCount) {
                    return tileCount;
                }
            };
            
            // create the parent
            var self = new SLICK.Graphics.View(GRUNT.extend({}, params, {
                // define panning and scaling properties
                pannable: true,
                scalable: true,
                scaleDamping: true
            }));
            
            // handle tap and double tap events
            SLICK.Touch.captureTouch(document.getElementById(params.container), params);
            
            // initialise self
            GRUNT.extend(self, {
                getTileLayer: function() {
                    return self.getLayer("grid" + gridIndex);
                },

                setTileLayer: function(value) {
                    // watch the layer
                    self.setLayer("grid" + gridIndex, value);
                    
                    // update the tile load threshold
                    GRUNT.WaterCooler.say("grid.updated", { grid: value });
                },

                gridPixToViewPix: function(vector) {
                    var offset = self.getOffset();
                    return new SLICK.Vector(vector.x - offset.x, vector.y - offset.y);
                },

                viewPixToGridPix: function(vector) {
                    var offset = self.getOffset();
                    return new SLICK.Vector(vector.x + offset.x, vector.y + offset.y);
                },
                
                cleanup: function() {
                    self.removeLayer("grid" + gridIndex);
                }
            }); // self

            return self;
        } // Tiler
    };
    
    return module;
    
})();