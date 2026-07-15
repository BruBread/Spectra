import mqtt from 'mqtt';
import { env } from '../../config/env.js';
import { parseTtnUplink } from './parsers/ttn.parser.js';
import { parseChirpstackUplink } from './parsers/chirpstack.parser.js';
import { persistUplink } from './lorawan.service.js';

/**
 * Optional alternative to the webhook endpoints: subscribes directly to the
 * network server's application MQTT broker instead of waiting for inbound
 * webhook calls. Enable with MQTT_ENABLED=true.
 */
export function startLorawanMqttClient() {
  const { mqttBrokerUrl, mqttUsername, mqttPassword, mqttTopic, mqttProvider } = env.lorawan;

  if (!mqttBrokerUrl || !mqttTopic) {
    console.warn('[lorawan-mqtt] MQTT_ENABLED is true but MQTT_BROKER_URL or MQTT_TOPIC is missing; skipping');
    return;
  }

  const client = mqtt.connect(mqttBrokerUrl, {
    username: mqttUsername || undefined,
    password: mqttPassword || undefined,
    reconnectPeriod: 5000,
  });

  client.on('connect', () => {
    console.log(`[lorawan-mqtt] connected to ${mqttBrokerUrl}`);
    client.subscribe(mqttTopic, (error) => {
      if (error) {
        console.error('[lorawan-mqtt] subscribe failed', error);
      } else {
        console.log(`[lorawan-mqtt] subscribed to ${mqttTopic}`);
      }
    });
  });

  client.on('message', async (_topic, payload) => {
    try {
      const body = JSON.parse(payload.toString('utf8'));
      const normalized = mqttProvider === 'chirpstack'
        ? parseChirpstackUplink(body)
        : parseTtnUplink(body);
      await persistUplink(normalized);
    } catch (error) {
      console.error('[lorawan-mqtt] failed to process message', error);
    }
  });

  client.on('error', (error) => {
    console.error('[lorawan-mqtt] connection error', error);
  });

  return client;
}
