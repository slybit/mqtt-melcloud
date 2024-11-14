const mqtt = require('mqtt');
const { melcloud } = require('./mymelcloud/index.js');
const { version } = require('./package');
const { logger } = require('./standardlogger.js');
const config = require('./config.js').parse();

const topics = {
	state: () => `${config.mqtt.topicPrefix}/state`,
	device: () => `${config.mqtt.topicPrefix}/device`,
	status: (id) => `${config.mqtt.topicPrefix}/status/${id}`,
	info: (id) => `${config.mqtt.topicPrefix}/info/${id}`,
	set: (id) => `${config.mqtt.topicPrefix}/set/${id}`,
};


// ============================================================
// Establish the MQTT client
// ============================================================

// Melcloud device (IDs) that we are subscribed to on the mqtt bus (that we listen to for commands)
const subsciptions = {};

const mqttClient = mqtt.connect(config.mqtt.url, { ...config.mqtt.options,
	will: {
		topic: topics.state(),
		payload: JSON.stringify({ online: false }),
		retain: true,
	}
});

mqttClient.on('connect', function () {
	logger.info('[mqtt] connected');
});

mqttClient.on('close', function () {
	logger.warn('[mqtt] disconnected');
});

mqttClient.on('reconnect', function () {
	logger.info('[mqtt] trying to reconnect');
});


// ============================================================
// Establish the Melcloud client
// ============================================================


const cloud = melcloud(config.melcloud);
cloud.login()
.then(() => {
	cloud.startFetcher();
})
.catch((e) => {
	logger.error('[melcloud] Error during connection establishment to Melcloud');
	throw (e);
});



/*
Events issues from the Melcloud connector
*/

// Called after a successfull login in the Melcloud service
cloud.on('login', () => {
	logger.info(`[melcloud] logged in as ${config.melcloud.username}`);
	logger.info(`[melcloud] polling interval is ${config.melcloud.interval}ms`);

	mqttClient.publish(topics.state(), JSON.stringify({
		online: true,
		version,
	}), { retain: true });
});

// Called when disconnected from the Melcloud service
cloud.on('disconnected', () => {
	logger.warn('[melcloud] disconnected');

	mqttClient.publish(topics.state(), JSON.stringify({
		online: false,
		version,
	}), { retain: true });
});


// Called when a new device is attached
cloud.on('device', (device) => {
	const topic = topics.set(device.id);
	mqttClient.subscribe(topic);
	subsciptions[topic] = device;

	logger.info(`[melcloud] registed device at ${topics.status(device.id, device.building)}`);

	mqttClient.publish(topics.device(), JSON.stringify(device.info), {
		retain: false,
	});

	mqttClient.publish(topics.info(device.id), JSON.stringify(device.info), {
		retain: false,
	});
});


// Called when a device wants to push a state update to MQTT
cloud.on('state', (device, state) => {
	logger.debug(`[melcloud] received state for ${topics.status(device.id, device.building)}`);
	mqttClient.publish(topics.status(device.id, device.building), JSON.stringify({...state, ...device.info}), {
		retain: false,
	});
});

// Called for any error from the melcloud connector
cloud.on('error', (e) => {
	logger.error(`[melcloud] unexpected error: ${e.toString()}`);
});

// Called for any error from a device attached to the melcloud connector
cloud.on('device/error', (device, e) => {
	logger.error(`[melcloud] unexpected device error: ${e.toString()}`);
});


// ============================================================
// MQTT message handling
// ============================================================



mqttClient.on('message', (topic, data) => {
	const device = subsciptions[topic];
	if (!device) {
		error('mqtt', `received data for unknown device ${topic}`);
		return;
	}
	try {
		logger.debug(`[mqtt] received update for ${topic}: ${data.toString()}`);
		device.set(JSON.parse(data.toString()));
	} catch (e) {
		logger.error('[mqtt] Not able to parse incoming message. Ignoring.');
	}
});




