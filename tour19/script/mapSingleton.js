var mapSingleton = (function () {

    // Instance stores a reference to the Singleton
    var instance;

    function init() {

        var prvt_map;
        var prvt_state = {
            userInteractions: true,
            position: undefined,
            positionHistory: [], 
            defaultLayers: {
                buildings3d: undefined,
                positionMarker: undefined
            },
            lastLookAt: undefined,
            currentViewPosition: undefined,
            currentPosition: undefined
        };

        function prvt_addBuildings3d() {
            prvt_state.defaultLayers.buildings3d = true;

            var layers = prvt_map.getStyle().layers;
            var labelLayerId;
            for (var i = 0; i < layers.length; i++) {
                if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
                    labelLayerId = layers[i].id;
                    break;
                }
            }

            prvt_map.addLayer({
                id: '3d-buildings',
                source: 'composite',
                'source-layer': 'building',
                filter: ['==', 'extrude', 'true'],
                type: 'fill-extrusion',
                minzoom: 15,
                paint: {
                    'fill-extrusion-color': '#666',
                    'fill-extrusion-height': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15,
                        0,
                        15.05,
                        ['get', 'height']
                    ],
                    'fill-extrusion-base': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15,
                        0,
                        15.05,
                        ['get', 'min_height']
                    ],
                    'fill-extrusion-opacity': 0.6
                }
            },labelLayerId);
        }

        function prvt_addControls() {
            prvt_state.defaultLayers.controls = true;
            prvt_map.addControl(new mapboxgl.NavigationControl());
            prvt_map.addControl(
                new mapboxgl.GeolocateControl({
                    positionOptions: {
                        enableHighAccuracy: true
                    },
                    trackUserLocation: true
                })
            );
        }

        function prvt_addLine(settings) {
            //Vorbehandeln von Koordinaten
            var finalCoords;
            if (settings.transform == true) {
                finalCoords = [];
                settings.route.forEach((item) => {
                    finalCoords.push([item.lon, item.lat]);
                });
            } else {
                finalCoords = settings.route;
            }

            if (settings.unique) {
                prvt_removeLayer([settings.id]);
            }

            //neue Layer mit Routenlinie
            prvt_map.addLayer({
                id: settings.id,
                type: 'line',
                source: {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: finalCoords
                        }
                    }
                },
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                minzoom: 12,
                paint: {
                    'line-color': 'rgba(66,133,244,0.3)',
                    'line-width': 8
                }
            });
        }

        function prvt_addMarker(settings) {
            var el = document.createElement('div');
            el.className = settings.className;
            var newMarker = new mapboxgl.Marker(el).setLngLat(settings.coord);

            if (settings.title && settings.title.use)  {
                newMarker.setPopup(new mapboxgl.Popup({ offset: 25 }) // add popups
                .setHTML('<h3>' + settings.title.text + '</h3>'));
            }
            return newMarker.addTo(prvt_map);
        }

        function prvt_removeLayer(layerIdArray) {
            layerIdArray.forEach( (layerId) => {
                if (typeof layerId != "undefined" && prvt_map.getLayer(layerId)) {
                    prvt_map.removeLayer(layerId);
                    prvt_map.removeSource(layerId);
                }
            })
        }

        function prvt_flyTo(settings) {
            if (typeof settings.lookAt == "undefined") {
                if (typeof prvt_state.lastLookAt == "undefined") {
                    return;
                } else {
                    settings.lookAt = prvt_state.lastLookAt;
                }
            } else {
                prvt_state.lastLookAt = settings.lookAt;
            }


            //abbrechen, wenn Positionsänderung unter 7m, damit wiggle verhindert wird
            if ( typeof prvt_state.currentViewPosition != "undefined" ) {
                if ( distance(prvt_state.currentViewPosition.lat, prvt_state.currentViewPosition.lon, settings.center.lat, settings.center.lon) < 7 ) {
                    return;
                }
             }

             prvt_state.currentViewPosition = settings.center;

             var bearingAngle = bearing(settings.center.lat, settings.center.lon, settings.lookAt.lat, settings.lookAt.lon);
             prvt_map.flyTo({
                 center: [
                     settings.center.lon,
                     settings.center.lat
                 ],
                 pitch: 60,
                 bearing: bearingAngle,
                 zoom: 18
             });
        }

        function prvt_updateLocation() {
            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(function(position){

                    //maximum size of 10 last positions
                    if (prvt_state.positionHistory.length >= 10) {
                        prvt_state.positionHistory.pop();
                    }
                    //add at beginning of array
                    prvt_state.positionHistory.unshift({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });

                    var avgLat = prvt_state.positionHistory.reduce(function (sumLat, pos) {
                        return sumLat + pos.lat;
                    }, 0) / prvt_state.positionHistory.length;

                    var avgLon = prvt_state.positionHistory.reduce(function (sumLon, pos) {
                        return sumLon + pos.lon;
                    }, 0) / prvt_state.positionHistory.length;

                    prvt_state.position = {
                        lat: avgLat,
                        lon: avgLon
                    };

                    if (prvt_state.defaultLayers.positionMarker) {
                        prvt_state.defaultLayers.positionMarker.remove();
                    }
                    prvt_state.defaultLayers.positionMarker = prvt_addMarker({
                        className: "mapboxgl-user-location-dot",
                        coord: [prvt_state.position.lon, prvt_state.position.lat]
                    });

                    prvt_flyTo({center: prvt_state.position});
                    resolve(prvt_state.position);
                }, function(error) {
                    alert("unable to retrieve location");
                    reject();
                });
            });
        }

        function prvt_setUserInteractions(userInteractions) {
            if (userInteractions == false) {
                prvt_map.dragRotate.disable();
                prvt_map.dragPan.disable();
                prvt_map.keyboard.disable();
                prvt_map.doubleClickZoom.disable();
                prvt_map.scrollZoom.disable();
                prvt_map.boxZoom.disable();
                prvt_map.touchZoomRotate.disable();
            } else {
                prvt_map.dragRotate.enable();
                prvt_map.dragPan.enable();
                prvt_map.keyboard.enable();
                prvt_map.doubleClickZoom.enable();
                prvt_map.scrollZoom.enable();
                prvt_map.boxZoom.enable();
                prvt_map.touchZoomRotate.enable();
            }

        }

        //create new map when init
        (function(){
            mapboxgl.accessToken = 'pk.eyJ1IjoiaGVpa29kZSIsImEiOiJjazRlNmpkYTIwOXRiM25vM3o0bnpkcDUwIn0.n5uKXIwegkQnozYiCbmEIw';
            prvt_map = new mapboxgl.Map({
                container: 'mapContainer',
                style: 'mapbox://styles/mapbox/dark-v10',
                center: [11.5761, 48.1371],
                zoom: 12,
                antialias: true
            });

            prvt_map.on('load', function() {
                prvt_addBuildings3d();
                //prvt_addControls();
                prvt_setUserInteractions(prvt_state.userInteractions);

                prvt_addLine({id: "tramRoute", route: route, transform: true});
                
                routeStopsGeoJson.features.forEach( (marker) => {
                    prvt_addMarker({
                        className: "stopMarker",
                        coord: marker.geometry.coordinates,
                        title: {use: true, text: marker.properties.title}
                    });
                })
                
                poiGeoJson.features.forEach( (marker) => {
                    prvt_addMarker({
                        className: "poiMarker",
                        coord: marker.geometry.coordinates,
                        title: {use: true, text: marker.properties.title}
                    });
                })
                
            });
        })();

        return {
            // Public methods and variables
            state: prvt_state,
            addLine: prvt_addLine,
            flyTo: prvt_flyTo,
            updateLocation: prvt_updateLocation,
            mapForTest: prvt_map
        };

    };

    return {
        // Get the Singleton instance if one exists
        // or create one if it doesn't
        getInstance: function () {
            if (!instance) {
                instance = init();
            }
            return instance;
        }
    };

})();