const { Spot } = require('@binance/spot');

const binanceClient = new Spot({
  configurationRestAPI: {},
  configurationWebsocketStreams: {},
});

module.exports = binanceClient;
