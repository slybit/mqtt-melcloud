const { connect } = require('mqtt');
const { melcloud } = require('./mymelcloud');
const { config } = require('./config');
const { version } = require('./package');

const topics = {
	state: () => `${config.mqtt.path}/state`,
	device: () => `${config.mqtt.path}/device`,
	update: (id) => `${config.mqtt.path}/${id}`,
	status: (id) => `${config.mqtt.path}/status/${id}`,
	info: (id) => `${config.mqtt.path}/info/${id}`,
	set: (id) => `${config.mqtt.path}/set/${id}`,
};

const mqtt = connect(config.mqtt.host, {
	username: config.mqtt.username,
	password: config.mqtt.password,
	clientId: config.mqtt.id,
	will: {
		topic: topics.state(),
		payload: JSON.stringify({ online: false }),
		retain: true,
	},
});

const cloud = melcloud(config.melcloud);
cloud.login()
.then(() => {
	cloud.startFetcher();
})
.catch((e) => {
	console.log(e);
	throw (e);
});

const subsciptions = {};

const format = (type, args) => [
	`[${type.toUpperCase()}]`,
	...args,
].join(' ');

const log = (type, ...args) => console.log(format(type, args));

const error = (type, ...args) => console.error(format(type, args));




/*
Events issues from the Melcloud connector
*/

// Called after a successfull login in the Melcloud service
cloud.on('login', () => {
	log('melcloud', `logged in as ${config.melcloud.username}`);
	log('melcloud', `polling interval is ${config.melcloud.interval}ms`);

	mqtt.publish(topics.state(), JSON.stringify({
		online: true,
		version,
	}), { retain: true });
});

// Called when disconnected from the Melcloud service
cloud.on('disconnected', () => {
	log('melcloud', `disconnected`);

	mqtt.publish(topics.state(), JSON.stringify({
		online: false,
		version,
	}), { retain: true });
});


// Called when a new device is attached
cloud.on('device', (device) => {
	const topic = topics.set(device.id);
	mqtt.subscribe(topic);
	subsciptions[topic] = device;

	log('melcloud', `registed device at ${topics.update(device.id, device.building)}`);

	mqtt.publish(topics.device(), JSON.stringify(device.info), {
		retain: false,
	});

	mqtt.publish(topics.info(device.id), JSON.stringify(device.info), {
		retain: false,
	});
});


// Called when a device wants to push a state update to MQTT
cloud.on('state', (device, state) => {
	log('melcloud', `received state for ${topics.update(device.id, device.building)}`);
	console.log(state);
	mqtt.publish(topics.status(device.id, device.building), JSON.stringify(state), {
		retain: true,
	});
});

// Called for any error from the melcloud connector
cloud.on('error', (e) => {
	error('melcloud', 'unexpected error');
	error('melcloud', `  > ${e.toString()}`);
});

// Called for any error from a device attached to the melcloud connector
cloud.on('device/error', (device, e) => {
	error('melcloud', 'unexpected device error');
	error('melcloud', `  > ${e.toString()}`);
    console.log(e);
});


/*
MQTT message handling
*/

mqtt.on('connect', () => log('mqtt', `connected to ${config.mqtt.host}`));


mqtt.on('message', (topic, data) => {
	const device = subsciptions[topic];
    console.log(device);

	if (!device) {
		error('mqtt', `received data for unknown device ${topic}`);
		return;
	}

	try {
		log('mqtt', `received update for ${topic}`);
		log('mqtt', `  > ${data.toString()}`);

		device.set(JSON.parse(data.toString()));
	} catch (e) {
        console.log(e);
		error('mqtt', 'not able to parse incoming message');
	}
});

mqtt.on('error', (e) => {
	error('mqtt', 'connection error');
	error('mqtt', `  > ${e.toString()}`);
});


