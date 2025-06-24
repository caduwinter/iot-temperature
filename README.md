# Geladeira IoT - Monitoramento de Temperatura

Este projeto implementa uma solução de Internet das Coisas (IoT) para monitorar a temperatura e umidade de uma geladeira, garantindo a integridade dos alimentos. Utiliza um microcontrolador (ESP8266/Arduino) para coletar dados e enviar alertas via MQTT, um backend Node.js para armazenamento e notificação, e um dashboard web para visualização em tempo real.

## Funcionalidades

- Monitoramento em tempo real da temperatura e umidade da geladeira
- Alertas automáticos quando a temperatura ultrapassa o limite seguro
- Notificações por e-mail para o responsável
- Dashboard web com histórico de leituras e alertas
- Armazenamento dos dados em banco SQLite

## Arquitetura

```
[ESP8266/Arduino + DHT22]
        |
     (MQTT)
        |
  [Broker MQTT]
        |
   [Backend Node.js]
        |         \
   [SQLite]   [Dashboard]
        |
    [E-mail]
```

## Requisitos

- Node.js (v16+ recomendado)
- npm
- Conta de e-mail (Gmail recomendado para envio de alertas)
- Broker MQTT (já configurado no código)

## Instalação

### 1. Clone o repositório

```sh
# No seu terminal
cd ~/Desktop
# ou onde preferir

git clone https://github.com/seu-usuario/seu-repo.git
cd seu-repo/iot
```

### 2. Backend

```sh
cd src
npm install
```

#### Configuração do e-mail

- Para Gmail, ative a verificação em duas etapas e gere uma senha de app ([veja como](https://support.google.com/accounts/answer/185833?hl=pt-BR))

#### Configuração do arquivo `.env`

Crie um arquivo chamado `.env` na pasta `src` (ou na raiz do backend, dependendo de onde executará `node index.js`). Sugerimos copiar o exemplo abaixo e ajustar conforme a sua infraestrutura:

```
# ---------------- MQTT ----------------
MQTT_BROKER=mqtt://broker.hivemq.com      # URL do broker MQTT
MQTT_USER=usuario_mqtt                    # (opcional) usuário do broker
MQTT_PASS=senha_mqtt                      # (opcional) senha do broker

# Tópicos (mantenha se já estiver usando os padrões no firmware)
TOPIC_DADOS=geladeira/temperatura         # tópico de dados de temperatura/umidade
TOPIC_ALERTA=geladeira/alerta             # tópico de alertas de temperatura

# ---------------- Servidor HTTP ----------------
PORT=3001                                 # porta onde o backend vai escutar

# ---------------- SMTP (e-mail) ----------------
SMTP_HOST=smtp.gmail.com                  # host SMTP (Gmail no exemplo)
SMTP_PORT=465                             # porta segura (SSL)
SMTP_USER=SEU_EMAIL@gmail.com             # e-mail de origem
SMTP_PASS=SENHA_DO_APP                    # senha de app gerada no Gmail
DESTINATARIO=email_destino@example.com    # quem receberá os alertas
```

Recomendações:

- Gere uma senha de app no Gmail e **nunca** utilize sua senha principal.
- Mantenha o arquivo `.env` fora do controle de versão (`.gitignore`).
- Se estiver usando outro provedor de e-mail, atualize `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASS` conforme a documentação do serviço.
- Caso seu broker MQTT exija autenticação, preencha `MQTT_USER` e `MQTT_PASS`; caso contrário, deixe em branco.

Depois de criar e preencher o `.env`, execute o backend normalmente:

```sh
cd src
node index.js
```

## Execução

### 1. Inicie o backend

```sh
cd src
node index.js
```

Acesse [http://localhost:3001](http://localhost:3001) no navegador.

## Código do Microcontrolador

O código para o ESP8266/Arduino está no início deste repositório. Ele lê temperatura/umidade do sensor DHT22 e publica nos tópicos MQTT:

- `geladeira/temperatura`
- `geladeira/alerta`

### Exemplo de configuração (`.ino`)

```cpp
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
```

Substitua os valores de `ssid`, `password`, `mqtt_server`, `mqtt_port`, `mqtt_user` e `mqtt_pass` pelos dados da sua rede Wi-Fi e do seu broker MQTT. Mantenha `topic_dados` e `topic_alerta` ou ajuste conforme o tópico escolhido.

## Segurança

- O backend utiliza senha de app para envio de e-mails (não compartilhe sua senha normal!)
- O acesso ao dashboard é local, mas pode ser protegido com autenticação se necessário
- O banco de dados SQLite é local, para produção recomenda-se um banco mais robusto

## Observações

- O projeto pode ser adaptado para outros sensores ou aplicações IoT
- Para dúvidas ou melhorias, abra uma issue ou pull request

---

Desenvolvido para a disciplina de Internet das Coisas
