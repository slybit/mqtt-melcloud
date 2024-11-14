# Introduction

`melcloud2mqtt` is a small nodejs appplication that allows MQTT integration with  
the Mitsubishi Melcloud service.

It can be used to track the status of devices and to control the settings of devices.

This tool was written for my personal use and the integration is not 'complete', but it should be easy to extend to your liking.

The code is based on this project: https://github.com/zephyrus/mqtt-melcloud

# MQTT topics and messages

## Status updates

The following topics are used to send out status updates of your Melcloud devices:


| TOPIC                       | Content                                                                                            |
|-----------------------------|----------------------------------------------------------------------------------------------------|  
| `{topicPrefix}/state`       |  Status and version of this MQTT bridge. This is sent when your start or exit the application.     |
| `{topicPrefix}/device`      |  Basicd device information. This is sent when a new device connects to Melcloud.                   |
| `{topicPrefix}/info/{id}`   |  Same as above.                                                                                    |
| `{topicPrefix}/status/{id}` |  Device state information. Sent regularly. The refresh rate is set in the configuration.           |


## Controlling devices through MQTT

| TOPIC                       | Content                                                                                            |
|-----------------------------|----------------------------------------------------------------------------------------------------|  
| `{topicPrefix}/set/{id}`    |  JSON with one or more settings to change                                                          | 


### Update JSON content

```JSON
{
  "power" : "[true/false (as boolean)] Turn device on/off",
  "target" : "[integer] Target set temperature",
  "fan": "['auto' or integer between 1 and NumberOfFanSpeeds] Fan speed", 
  "mode": "[integer] Set device mode (see below)",
  "horizontal": "['auto', 'swing' or value between 0-1] Horizontal fan movement setting",
  "vertical": "['auto', 'swing' or value between 0-1] Vertical fan movement setting"
}
```

It is possible to set leave out any of the parameters.  Any parameter that is left out will not be affected.

Example, turn on the device and set the target temperature:
```JSON
{
  "power" : true,
  "target" : 21
}
```

#### `fan` values

The total number of Fan speeds supported by the device will be part of the status update message.
The value you provide to set the fan speed must be an integer between 1 and that maximum speed value.

#### `mode` values

```
    heat: 1,
    dry: 2,
    cool: 3,
    fan: 7,
    auto: 8,
```


## Docker run command

```bash
docker run -d --rm -v /path/to/config.yaml:/usr/src/app/config/config.yaml slybit/melcloud2mqtt:1.0
```