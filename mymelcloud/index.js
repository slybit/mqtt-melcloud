const { EventEmitter } = require('events');
const axios = require('axios').default;

const { Device } = require('./device');


const timeout = (time) => new Promise((resolve) => setTimeout(resolve, time));

class Cloud extends EventEmitter {

    constructor({ username, password, interval, refresh }) {
        super();

        this.devices = [];
        this.interval = interval;
        this.refresh = refresh;
        this.fetcher = null;
        this.credentials = { username, password };

    }

    // Send a GET request to the Melcloud service
    async getRequest(url) {
        try {
            let response = await axios.get(url, {
                headers: {
                    'X-MitsContextKey': this.loginDetails.ContextKey,
                    'content-type': 'application/json',
                }
            })
            return response;
        } catch (e) {
            if (e.response && e.response.status === 401) {
                console.log('X-MitsContextKey expired. Logging in.');
                this.emit('disconnected');
                await this.login();
                await this.fetch();
            }
            throw(e);
        }
    }

    // Send a POST request to the Melcloud service
    async postRequest(url, data) {
        try {
            let response = await axios.post(url, data, {
                headers: {
                    'X-MitsContextKey': this.loginDetails.ContextKey,
                    'content-type': 'application/json',
                }
            })
            return response;
        } catch (e) {
            if (e.response && e.response.status === 401) {
                console.log('X-MitsContextKey expired. Logging in.');
                this.emit('disconnected');
                await this.login();
                await this.fetch();
            }
            throw(e);
        }
    }

    // Log in to the Melcloud service, with a retry every 5 minutes
    async login() {
        let attempts = 1;
        let success = false;
        while (!success) {
            try {
                console.log("Connecting to Melcloud. Attempt " + attempts);
                this.loginDetails = await this._login();
                this.emit('login');
                success = true;
            } catch (e) {
                await timeout(300000);
                attempts++;
            }
        }
    }

    // Start the building+device fetcher
    async startFetcher() {
        if (this.fetcher) clearInterval(this.fetcher);
        this.fetcher = setInterval(() => this.fetch(), this.refresh);
        await this.fetch();
    }

    // Function that does the actual log in
    _login() {
        const form = {
            AppVersion: '1.9.3.0',
            CaptchaChallenge: '',
            CaptchaResponse: '',
            Email: this.credentials.username,
            Language: 0,
            Password: this.credentials.password,
            Persist: 'true'
        };

        return axios.post('https://app.melcloud.com/Mitsubishi.Wifi.Client/Login/ClientLogin', form, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        })
            .then((response) => {
                if (response.status !== 200) {
                    throw new Error('Unknown error during login.');
                }
                const data = response.data.LoginData;
                if (data === null) {
                    console.error('Failed to login. Wrong credentials. Terminating.');
                    process.exit(1);
                }
                return data;
            })
            .catch((e) => {
                this.emit('error', e);
                throw (e);
            });
    }

    // Get the building and device list from the Melcloud account
    fetch() {
        const url = 'https://app.melcloud.com/Mitsubishi.Wifi.Client/User/ListDevices';
        return this.getRequest(url)
            .then((response) => {
                const devices = response.data.reduce((result, location) => {

                    location.Structure.Devices
                        .forEach((device) => result.push({ device, location }));

                    location.Structure.Floors.forEach((floor) => {
                        floor.Devices
                            .forEach((device) => result.push({ device, location }));

                        floor.Areas.forEach((area) => {
                            area.Devices
                                .forEach((device) => result.push({ device, location }));
                        });
                    });

                    location.Structure.Areas.forEach((area) => {
                        area.Devices
                            .forEach((device) => result.push({ device, location }));
                    });

                    return result;
                }, []);

                devices.forEach(({ device, location }) => this.attach(device, location));
            })
            .catch((e) => {
                console.log(e);
                console.log(e.response.status);
                this.emit('error', e)
            });
    }

    // Attach (only new) devices so that they start getting updates
    attach(data, location) {
        const known = this.devices.some((device) => {
            return device.id === data.DeviceID && device.building === data.BuildingID;
        });

        if (known) return;

        const device = new Device(this, data, location);

        this.devices.push(device);

        // proxy device updates
        device.on('state', (...args) => this.emit('state', device, ...args));
        device.on('connect', (...args) => this.emit('device', device, ...args));
        device.on('error', (...args) => this.emit('device/error', device, ...args));
    }

}

module.exports.melcloud = (...args) => new Cloud(...args);
