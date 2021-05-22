// calculates look angles between two points
// format of a and b should be {lon: 0, lat: 0, alt: 0}
// returns {elevention: 0, azimut: 0, bearing: "", range: 0}
//
// based on earthmath.py
// Copyright 2012 (C) Daniel Richman; GNU GPL 3

var DEG_TO_RAD = Math.PI / 180.0;
var EARTH_RADIUS = 6371000.0;

function calculate_lookangles(a, b) {
    // degrees to radii
    a.lat = a.lat * DEG_TO_RAD;
    a.lon = a.lon * DEG_TO_RAD;
    b.lat = b.lat * DEG_TO_RAD;
    b.lon = b.lon * DEG_TO_RAD;

    var d_lon = b.lon - a.lon;
    var sa = Math.cos(b.lat) * Math.sin(d_lon);
    var sb = (Math.cos(a.lat) * Math.sin(b.lat)) - (Math.sin(a.lat) * Math.cos(b.lat) * Math.cos(d_lon));
    var bearing = Math.atan2(sa, sb);
    var aa = Math.sqrt(Math.pow(sa, 2) + Math.pow(sb, 2));
    var ab = (Math.sin(a.lat) * Math.sin(b.lat)) + (Math.cos(a.lat) * Math.cos(b.lat) * Math.cos(d_lon));
    var angle_at_centre = Math.atan2(aa, ab);
    var great_circle_distance = angle_at_centre * EARTH_RADIUS;

    ta = EARTH_RADIUS + a.alt;
    tb = EARTH_RADIUS + b.alt;
    ea = (Math.cos(angle_at_centre) * tb) - ta;
    eb = Math.sin(angle_at_centre) * tb;
    var elevation = Math.atan2(ea, eb) / DEG_TO_RAD;

    // Use Math.coMath.sine rule to find unknown side.
    var distance = Math.sqrt(Math.pow(ta, 2) + Math.pow(tb, 2) - 2 * tb * ta * Math.cos(angle_at_centre));

    // Give a bearing in range 0 <= b < 2pi
    bearing += (bearing < 0) ? 2 * Math.PI : 0;
    bearing /= DEG_TO_RAD;

    var value = Math.round(bearing % 90);
    value = ((bearing > 90 && bearing < 180) || (bearing > 270 && bearing < 360)) ? 90 - value : value;

    var str_bearing = "" + ((bearing < 90 || bearing > 270) ? 'N' : 'S')+ " " + value + '° ' + ((bearing < 180) ? 'E' : 'W');

    return {
        'elevation': elevation,
        'azimuth': bearing,
        'range': distance,
        'great_circle_distance': great_circle_distance,
        'bearing': str_bearing
    };
}

function getPressure(altitude){

    // Constants
    airMolWeight = 28.9644;  // Molecular weight of air
    densitySL = 1.225;  // Density at sea level [kg/m3]
    pressureSL = 101325;  // Pressure at sea level [Pa]
    temperatureSL = 288.15;  // Temperature at sea level [deg K]
    gamma = 1.4;
    gravity = 9.80665;  // Acceleration of gravity [m/s2]
    tempGrad = -0.0065;  // Temperature gradient [deg K/m]
    RGas = 8.31432;  // Gas constant [kg/Mol/K]
    R = 287.053;
    deltaTemperature = 0.0;

    // Lookup Tables
    altitudes = [0, 11000, 20000, 32000, 47000, 51000, 71000, 84852];
    pressureRels = [
        1,
        2.23361105092158e-1,
        5.403295010784876e-2,
        8.566678359291667e-3,
        1.0945601337771144e-3,
        6.606353132858367e-4,
        3.904683373343926e-5,
        3.6850095235747942e-6,
    ];
    temperatures = [288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.946];
    tempGrads = [-6.5, 0, 1, 2.8, 0, -2.8, -2, 0];
    gMR = gravity * airMolWeight / RGas;

    // Pick a region to work in
    i = 0;
    if (altitude > 0){
        while (altitude > altitudes[i + 1]){
            i = i + 1;
        }
    }

    // Lookup based on region
    baseTemp = temperatures[i];
    tempGrad = tempGrads[i] / 1000.0;
    pressureRelBase = pressureRels[i];
    deltaAltitude = altitude - altitudes[i];
    temperature = baseTemp + tempGrad * deltaAltitude;

    // Calculate relative pressure
    if(Math.abs(tempGrad) < 1e-10){
        pressureRel = pressureRelBase * Math.exp(
            -1 * gMR * deltaAltitude / 1000.0 / baseTemp
        );
    } else{
        pressureRel = pressureRelBase * Math.pow(
            baseTemp / temperature, gMR / tempGrad / 1000.0
        );
    }

    // Finally, work out the pressure
    pressure = pressureRel * pressureSL;

    return pressure/100.0; // Return pressure in hPa
}

function calculate_skewt(){
    // Calculate the Skew-T parameters from the flight data, and plot them.

    // Example Data:
    // alt: 3595.27013
    // batt: 2.9
    // burst_timer: 65535
    // datetime: "2021-05-21T23:27:32.001000Z"
    // frame: 2803
    // frequency: 401.5
    // heading: 71.53576
    // humidity: 69
    // lat: -34.97047
    // lon: 138.53653
    // manufacturer: "Vaisala"
    // position: "-34.97047,138.53653"
    // sats: 10
    // serial: "S4610774"
    // snr: 30.9
    // software_name: "radiosonde_auto_rx"
    // software_version: "1.5.0"
    // subtype: "RS41-SG"
    // temp: -5.1
    // time_received: "2021-05-21T23:27:16.227198Z"
    // type: "RS41"
    // uploader_alt: 140.01
    // uploader_antenna: "Diamond X-50"
    // uploader_callsign: "VK5FJGM_AUTO_RX"
    // uploader_position: "-35.08081,138.5585"
    // vel_h: 2.28313
    // vel_v: 4.7152

    // Check for enough data to be worth plotting.
    if(flight_data.length < 50){
        alert("Insufficient data for Skew-T plot.");
        return [];
    }

    // Check that we have ascent data
    if (burst_idx <= 0){
        alert("Insufficient data for Skew-T plot (Only descent data available).");
        return [];
    }

    // Check that the first datapoint is at a reasonable altitude.
    if (flight_data[0].alt > 15000){
        alert("Insufficient data for Skew-T plot (Only data > 15km available)");
        return [];
    }

    skewt_data = [];
    decimation = 25;
    if (v1_data == true){
        decimation = 1;
    }

    idx = 1;

    while (idx < burst_idx){
        //console.log(idx);

        entry = flight_data[idx];
        old_entry = flight_data[idx-1];

        _old_date = new Date(old_entry.datetime);
        _new_date = new Date(entry.datetime);
        _time_delta = (_new_date - _old_date)/1000.0;
        if (_time_delta <= 0){
            idx = idx + 1;
            continue;
        }

        _temp = null;
        _dewp = -999.0;
        _pressure = null;

        // Extract temperature datapoint
        if (entry.hasOwnProperty('temp')){
            if(parseFloat(entry.temp) > -270.0){
                _temp = parseFloat(entry.temp);
            } else{
                idx = idx + 1;
                continue;
            }
        }else{
            // No temp data. Skip to the next point
            idx = idx + 1;
            continue;
        }

        // Try and extract RH datapoint
        if (entry.hasOwnProperty('humidity')){
            if(parseFloat(entry.humidity) >= 0.0){
                _rh = parseFloat(entry.humidity);
                //console.log(_rh);
                //console.log(_temp);
                // Calculate the dewpoint
                _dewp = (243.04 * (Math.log(_rh / 100) + ((17.625 * _temp) / (243.04 + _temp))) / (17.625 - Math.log(_rh / 100) - ((17.625 * _temp) / (243.04 + _temp))));
                //console.log(_dewp);
            } else {
                _dewp = -999.0;
            }
        }

        // Calculate movement
        _old_pos = {'lat': old_entry.lat, 'lon': old_entry.lon, 'alt': old_entry.alt};
        _new_pos = {'lat': entry.lat, 'lon': entry.lon, 'alt': entry.alt};

        _pos_info = calculate_lookangles(_old_pos, _new_pos);
        _wdir = (_pos_info['azimuth']+180.0)%360.0;
        _wspd = _pos_info['great_circle_distance']/_time_delta;

        if (entry.hasOwnProperty('pressure')){
            _pressure = entry.pressure;
        } else {
            // Otherwise, calculate it
            _pressure = getPressure(_new_pos.alt);
        }

        if(_pressure < 100.0){
            break;
        }

        _new_skewt_data = {"press": _pressure, "hght": _new_pos.alt, "temp": _temp, "dwpt": _dewp, "wdir": _wdir, "wspd": _wspd};
        //console.log(_new_skewt_data);

        skewt_data.push(_new_skewt_data);

        idx = idx + decimation;
    }

    return skewt_data;
}

var skewt_plotted = false;


function plot_skewt(){

    // Avoid re-plotting.
    if(skewt_plotted == true){
        return;
    }

    if (flight_data.length == 0){
        // Data not loaded yet.
        return;
    }

    _skewt_data = calculate_skewt();

    if (_skewt_data.length > 0){

        var _buttons = {};
        _buttons.Close = function() {
            skewt_plotted = false;
            $( this ).dialog( "close" );
        };

        var divObj = $('#skewt-dialog');
        divObj.dialog({
            autoOpen: false,
            //bgiframe: true,
            modal: true,
            resizable: false,
            height: "auto",
            width: 800,
            position: { my: "center", at: "center top", of: window },
            title: "Skew-T Plot: " + serial_number,
            close: function() {
                // 'destroy' the dialog, so it opens again in the right position.
                skewt_plotted = false;
                divObj.dialog( "destroy" );
            }
        });
        divObj.dialog('open');

        try {
            skewt.clear()
        } catch(e) {
            skewt = new SkewT('#skewt-plot');
        }

        try {
            skewt.plot(_skewt_data);
            skewt_plotted = true;
		}
		catch(err) {
		    console.log(err);
		    alert(err);
		}	

    } else {
        alert("Insufficient Data available, or no Temperature/Humidity data available to generate Skew-T plot.");
    }
}