#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <FS.h>

#define DHTPIN D1
#define DHTTYPE DHT22

const char* ssid = "example";
const char* password = "example";

const char* mqtt_server = "example";
const int mqtt_port = 0000;
const char* mqtt_user = "example";
const char* mqtt_pass = "example";
const char* mqtt_client_id = "example";
const char* topic_dados = "geladeira/temperatura";
const char* topic_alerta = "geladeira/alerta";

WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(DHTPIN, DHT22);
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", -3 * 3600);

float limiteTemperatura = 30.0;
unsigned long lastSend = 0;
unsigned long lastReconnectAttempt = 0;
const unsigned long reconnectInterval = 5000;

void setup_wifi() {
  WiFi.begin(ssid, password);
  Serial.print("[INFO] Conectando ao Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[INFO] Wi-Fi conectado. IP: " + WiFi.localIP().toString());
}

void salvarOffline(String payload) {
  Serial.println("[OFFLINE] Salvando dado: " + payload);

  String payloadRetroativo = "RETROATIVO:" + payload;
  File file = SPIFFS.open("/offline.txt", "a+");
  if (file) {
    file.println(payloadRetroativo);
    file.close();
    Serial.println("[ARQUIVO] Dados salvos com sucesso.");
  } else {
    Serial.println("[ERRO] Falha ao abrir arquivo para escrita.");
  }
}

void enviarPendentes() {
  if (!SPIFFS.exists("/offline.txt")) return;

  File file = SPIFFS.open("/offline.txt", "r");
  if (!file) return;

  Serial.println("[INFO] Enviando dados pendentes:");

  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      if (client.publish(topic_dados, line.c_str())) {
        Serial.println("[MQTT] Enviado pendente: " + line);
      } else {
        Serial.println("[ERRO] Falha ao reenviar pendente.");
        break;
      }
    }
  }

  file.close();
  SPIFFS.remove("/offline.txt");
  Serial.println("[INFO] Pendências limpas.");
}

void reconnect() {
  unsigned long now = millis();
  if (now - lastReconnectAttempt >= reconnectInterval) {
    lastReconnectAttempt = now;

    if (!client.connected()) {
      Serial.print("[INFO] Tentando MQTT... ");
      if (client.connect(mqtt_client_id, mqtt_user, mqtt_pass)) {
        Serial.println("Conectado!");
        enviarPendentes();
      } else {
        Serial.print("Falha, rc=");
        Serial.println(client.state());
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();

  if (!SPIFFS.begin()) {
    Serial.println("[ERRO] SPIFFS falhou!");
  } else {
    Serial.println("[INFO] SPIFFS iniciado.");
  }

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  timeClient.begin();
}

void loop() {
  reconnect();
  client.loop();
  timeClient.update();

  unsigned long now = millis();
  if (now - lastSend >= 10000) {
    lastSend = now;

    float temperatura = dht.readTemperature();
    float umidade = dht.readHumidity();

    if (isnan(temperatura) || isnan(umidade)) {
      Serial.println("[ERRO] Leitura inválida!");
      return;
    }

    String horario = timeClient.getFormattedTime();
    String payload = "Temperatura: " + String(temperatura, 1) + " °C, Umidade: " + String(umidade, 1) + " %, Horário: " + horario;

    if (client.connected()) {
      client.publish(topic_dados, payload.c_str());
      Serial.println("[MQTT] Enviado: " + payload);

      if (temperatura > limiteTemperatura) {
        String alerta = "🚨 Temperatura acima do limite: " + String(temperatura, 1) + " °C (" + horario + ")";
        client.publish(topic_alerta, alerta.c_str());
        Serial.println("[MQTT] ALERTA enviado!");
      }

    } else {
      if (temperatura > limiteTemperatura) {
        salvarOffline(payload);
      }
    }
  }
}