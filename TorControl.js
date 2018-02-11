const net = require('net');
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

let multiPacket = false;
let multiPacketCache = [];

class TorControl extends EventEmitter {

	constructor() {
		super();

		this.authenticated = false;
	}

	connect(socket = '/var/run/tor/control', cookieLocation) {
		return new Promise(async (resolve, reject) => {

			this.socket = new net.Socket();
			const cookie = await TorControl.loadCookie(cookieLocation);

			this.socket.connect(socket, () => {
				this.socket.setNoDelay(true);
				this.socket.write(`AUTHENTICATE ${cookie}\r\n`);

				this.socket.once('data', (data) => {
					data = data.toString();

					if (!data.startsWith('250')) {
						this.socket.end();
						return reject(data);
					}

					this.authenticated = true;
					resolve();

					let dataCache = '';
					this.socket.on('data', (eventData) => {
						dataCache += eventData;

						let packetDelimiterIndex;
						while ((packetDelimiterIndex = dataCache.indexOf('\r\n')) > -1) {
							const packet = dataCache.slice(0, packetDelimiterIndex);
							this.handleData(packet);
							dataCache = dataCache.slice(dataCache.indexOf('\r\n') + 2, dataCache.length);
						}
					});
				});
			});

		});
	}

	subscribe(events) {
		this.send(`SETEVENTS ${events.join(' ')}`);
	}

	send(message) {
		if (!this.authenticated) throw new Error('Tried to send a message without being authenticated');
		this.socket.write(`${message}\r\n`);
	}

	handleData(data) {
		let status, type, eventData;

		if (/^\d{3}-/.test(data)) {
			status = data.slice(0, 3);
			type = data.slice(4, data.indexOf('='));
			eventData = data.slice(data.indexOf('=') + 1, data.length).trim().split(' ');
		} else if (/^\d{3}\+/.test(data)) {
			multiPacket = data.slice(4, data.length - 1);
			multiPacketCache = [];
			return;
		} else if (data === '250 OK') {
			status = 250;
			type = String(multiPacket || 'OK');
			eventData = multiPacketCache;
			if (eventData[eventData.length - 1] === '.') eventData.pop();
			multiPacket = false;
		} else if (multiPacket) {
			multiPacketCache.push(data);
			return;
		} else {
			[status, type, ...eventData] = data.split(' ');
		}

		if (status > 299 && status < 600) {
			const error = new Error(data);
			error.status = status;

			return this.emit('error', error);
		}

		switch (type) {
			case 'OK':
				break;
			case 'BW':
				eventData = eventData.map(Number);
				this.emit('bandwidth', {
					download: eventData.shift(),
					upload: eventData.shift()
				});

				break;
			case 'network-status':
				eventData = eventData.map(piece => {
					const [, fingerprint, nickname] = piece.split(/!?\$|~/g);
					return {
						fingerprint,
						nickname
					};
				});

				this.emit('networkStatus', eventData);
				break;
			default:
				this.emit('unknown', {
					status,
					type,
					eventData,
					data
				});

				this.emit(type, eventData);
		}
	}

	static loadCookie(path = '/var/run/tor/control.authcookie') {
		return new Promise((resolve, reject) => {
			fs.readFile(path, (err, data) => {
				if (err) return reject(err);
				resolve(data.toString('hex'));
			});
		});
	}

}

module.exports = TorControl;
