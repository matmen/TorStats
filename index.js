const StatsD = require('node-statsd');
const TorController = require('./lib/TorControl');

class StatsCollector {

	constructor() {
		this.torController = new TorController();
		this.statsd = new StatsD();

		this.downstream = 0;
		this.upstream = 0;
		this.clientCount = 0;

		this.run();
	}

	async run() {
		await this.torController.connect();
		this.torController.subscribe(['BW']);

		this.torController.on('bandwidth', (info) => {
			this.downstream = info.download;
			this.upstream = info.upload;
			this.statsd.gauge('tor.downstream', this.downstream);
			this.statsd.gauge('tor.upstream', this.upstream);
		});

		this.torController.on('orconn-status', (connections) => {
			this.clientCount = connections.filter(connection => connection.split(' ')[1] === 'CONNECTED').length;
			this.statsd.gauge('tor.clients', this.clientCount);
		});

		this.torController.on('error', console.error); // eslint-disable-line no-console

		setInterval(() => {
			this.torController.send('GETINFO orconn-status');
		}, 1000);

		setInterval(() => {
			process.stdout.write('\r\u{1B}[2K');
			process.stdout.write(`Downstream: ${this.format(this.downstream)}/s | Upstream: ${this.format(this.upstream)}/s | Connected Clients: ${this.clientCount}`);
		}, 1000);
	}

	format(bytes) {
		const types = ['B', 'KB', 'MB', 'GB', 'TB'];
		let divideBy = 1024,
			amount = Math.floor(Math.log(bytes) / Math.log(divideBy));
		return (bytes / Math.pow(divideBy, amount)).toFixed(2) + ' ' + types[amount];
	}

}

module.exports = new StatsCollector();
