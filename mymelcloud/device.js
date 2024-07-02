const { EventEmitter } = require('events');

const operationMode = {
    heat: 1,
    dry: 2,
    cool: 3,
    fan: 7,
    auto: 8,
};

const parseVane = (swing, values = 5) => (v) => {
    if (v === 0) return 'auto';

    if (v === swing) return 'swing';

    // if we have 5 positions, then
    // 1 = 0%
    // 2 = 25%
    // 3 = 50%
    // 4 = 75%
    // 5 = 100%
    if (v >= 1 && v <= values) return (v - 1) / (values - 1);

    return undefined;
};

const prepareVane = (swing, values = 5) => (v) => {
    if (v === 'auto') return 0;

    if (v === 'swing') return swing;

    if (v >= 0 && v <= 1) return Math.round(v * (values - 1) + 1);

    return undefined;
};

const parseVertical = parseVane(7);
const prepareVertical = prepareVane(7);
const parseHorizontal = parseVane(12);
const prepareHorizontal = prepareVane(12);


class Device extends EventEmitter {

    constructor(cloud, device, location) {
        super();

        this.state = undefined;

        this.cloud = cloud;
        this.data = device;
        this.location = location;

        this.id = device.DeviceID;
        this.building = device.BuildingID;

        this.info = {
            id: this.id,
            name: device.DeviceName,
            serial: device.SerialNumber,
            mac: device.MacAddress,
            building: this.building,

            lastSeen: device.LastTimeStamp,

            address: [
                location.AddressLine1,
                location.AddressLine2,
            ].join('\n'),

            location: {
                latitude: location.Latitude,
                longitude: location.Longitude,
            },
        };

        this.read();
        this.interval = setInterval(() => this.read(), this.cloud.interval);
    }

    // Get the device status information from the Melcloud service
    read() {
        const url = `https://app.melcloud.com/Mitsubishi.Wifi.Client/Device/Get?id=${this.id}&buildingID=${this.building}`;
        return this.cloud.getRequest(url)
            .then((state) => this.update(state.data))
            .catch((e) => this.emit('error', e));
    }

    // Update our internal state
    update(state) {
        // if this is the 1st time we see this device, register it
        if (!this.state) {
            this.emit('connect', {
                ...this.info,
            });
        }
        this.state = this.parseState(state);
        this.emit('state', this.state);
        return this.state;
    }

    // Clean up the status information that we received from the Melcloud service
    parseState(state) {
        // remove the WeatherObservations
        delete state.WeatherObservations
        // add some easier to read properties
        state.fan = state.SetFanSpeed === 0 ? 'auto' : state.SetFanSpeed / state.NumberOfFanSpeeds;
        state.mode = Object.keys(operationMode)
            .find((k) => operationMode[k] === state.OperationMode);
        return state;
    }



    /* Writing */

    set(update) {
        const change = this.prepareUpdate(update);

        const same = Object.keys(change)
            .every((k) => change[k] === undefined || this.state[k] === change[k]);

        if (same) return Promise.resolve();

        Object.keys(change).forEach((k) => {
            if (change[k] === undefined) change[k] = this.state[k];
        });

        const url = 'https://app.melcloud.com/Mitsubishi.Wifi.Client/Device/SetAta';
        const data = JSON.stringify({
            DeviceID: this.id,
            // due to we are trying to set all changable params
            EffectiveFlags: 287,
            ...change,
        });

        return this.cloud.postRequest(url, data)
            .then((state) => this.update(state.data))
            .catch((e) => this.emit('error', e));

    }

    prepareUpdate(update) {


        let setFanSpeed = update.fan !== undefined
            ? (update.fan === 'auto' ? 0 : Math.min(this.state.NumberOfFanSpeeds, Math.floor(update.fan * this.state.NumberOfFanSpeeds)))
            : undefined;

        if (isNaN(setFanSpeed)) setFanSpeed = undefined;


        return {
            Power: update.power !== undefined
                ? !!update.power
                : undefined,
            SetTemperature: update.target
                ? Math.round(update.target * 2) / 2
                : undefined,
            SetFanSpeed: setFanSpeed,
            OperationMode: operationMode[update.mode],
            VaneHorizontal: prepareHorizontal(update.horizontal),
            VaneVertical: prepareVertical(update.vertical),
        };
    }

}

module.exports = { Device };
