// eslint-disable-next-line
const _global = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {});
const WebSocket = _global.WebSocket || _global.MozWebSocket;

class SubscribeQL {
  constructor(props) {
    this.ws = null;
    this.subscriptions = [];
    this.queue = [];
    this.connected = false;
    this.awaitingConnection = false;
    this.endpoint = props.url;
    this.lazy = props.lazy;
    this.autoReconnect = props.reconnect;
    if (!this.lazy) {
      this.connect();
    }
  }

  connect = () => {
    if (!this.awaitingConnection && !this.connected) {
      this.awaitingConnection = true;
      this.ws = new WebSocket(this.endpoint, ['graphql-ws']);
      this.ws.onopen = this.init;
      this.ws.onmessage = this.onMessage;
      this.ws.onclose = this.onClose;
    }
  }

  reconnect = () => {
    this.subscriptions.forEach(item => this.queue.push({
      type: 'start',
      id: item.id,
      payload: { query: item.query, variables: item.variables },
    }));
    this.connect();
  }

  init = () => {
    this.send({
      type: 'connection_init',
      payload: {},
    });
  }

  send = data => this.ws.send(JSON.stringify(data));

  onMessage = ({ data }) => {
    const message = JSON.parse(data);
    let subscription = null;

    switch (message.type) {
      case 'connection_ack':
        this.connected = true;
        this.awaitingConnection = false;
        while (this.queue.length) {
          const msg = this.queue.pop();
          this.send(msg);
        }
        break;
      case 'data':
        subscription = this.subscriptions.find(item => item.id === Number(message.id));
        // eslint-disable-next-line
        subscription && subscription.callback(message.payload);
        break;
      default:
        // do nothing
    }
  }

  onClose = () => {
    this.connected = false;
    this.ws = null;
    if (this.autoReconnect) {
      this.reconnect();
    }
  }

  getLastId = () => {
    let lastId = 0;
    this.subscriptions.forEach((item) => {
      if (lastId < item.id) {
        lastId = item.id;
      }
    });
    return lastId + 1;
  }

  subscribe = ({ query, variables, callback }) => {
    const id = this.getLastId();
    const toSend = { type: 'start', id, payload: { query, variables } };

    if (!this.ws) {
      this.connect();
    }

    if (this.connected) {
      this.send(toSend);
    } else {
      this.queue.push(toSend);
    }
    this.subscriptions.push({
      id,
      query,
      variables,
      callback,
    });
    return id;
  }

  unsubscribe = (id) => {
    const idx = this.subscriptions.findIndex(item => item.id === id);

    this.send({ type: 'stop', id });
    this.subscriptions.splice(idx, 1);
  }
}

export default SubscribeQL;
