const StatsD = require('node-statsd');
const TorController = require('./TorControl');

let downstream, upstream, connCount;

const format = (bytes) => {
	bytes = bytes || 0;
	const types = ['B', 'KB', 'MB', 'GB', 'TB'];
	let divideBy = 1024,
		amount = Math.floor(Math.log(bytes) / Math.log(divideBy));
	return parseFloat(bytes / Math.pow(divideBy, amount)).toFixed(2) + ' ' + types[amount];
};

(async () => {
	const torController = new TorController();
	const statsd = new StatsD();

	await torController.connect();
	torController.subscribe(['BW']);

	torController.on('bandwidth', (info) => {
		downstream = info.download;
		upstream = info.upload;
		statsd.gauge('tor.downstream', downstream);
		statsd.gauge('tor.upstream', upstream);
	});

	torController.on('orconn-status', (conns) => {
		connCount = conns.filter(conn => conn.split(' ')[1] === 'CONNECTED').length;
		statsd.gauge('tor.clients', connCount);
	});

	torController.on('error', console.error);

	setInterval(() => {
		torController.send('GETINFO orconn-status');
	}, 1000);

	setInterval(() => {
		process.stdout.write('\r\u{1B}[2K');
		process.stdout.write(`Downstream: ${format(downstream)}/s | Upstream: ${format(upstream)}/s | Connected Clients: ${connCount}`);
	}, 1000);
})();
