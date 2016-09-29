
var debug   = require('debug')('qmotion'),
    events  = require('events'),
    net     = require('net'),
    storage = require('node-persist');

const TCP_PORT = 9760,
      UDP_PORT = 9720;

var supportedPosition = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];

function QMotion(ip) {
    events.EventEmitter.call(this);

    if (ip != undefined) {
        this.ip = ip;
        this.queue = [];
        this.tcpClient = null;
        this._readDevice();
    }
}
require('util').inherits(QMotion, events.EventEmitter);

QMotion.PositionState = {
    DECREASING: 0,
    INCREASING: 1,
    STOPPED:    2
}

QMotion.search = function() {
    var dgram = require("dgram");
    var server = dgram.createSocket("udp4");

    server.on("error", function (err) {
        debug("UDP error:\n" + err.stack);

        server.close();
        server.emit("timeout");
    });

    server.on("listening", function () {
        var address = server.address();
        debug("UDP listening " + address.address + ":" + address.port);

        var message = new Buffer("00", "hex");

        server.send(message, 0, message.length, UDP_PORT, "255.255.255.255", function(err) {
            if (err == null) {
                return;
            }

            debug("UDP error:\n" + err.stack);

            server.close();
            server.emit("timeout");
        });
    });

    server.on("message", function (msg, rinfo) {
        if (msg == undefined || msg.toString("hex") == "00") {
            return;
        }

        debug("UDP response: " + msg.toString("hex") + " from " + rinfo.address + ":" + rinfo.port);

        var device = new QMotion(rinfo.address);
        server.emit("found", device);

        device.on('initialized', function() {
            server.close();
        });
    });

    server.bind(UDP_PORT, "0.0.0.0", function() {
        server.setBroadcast(true);
    });

    return server;
}

QMotion.prototype.move = function(blind, position, callback) {
    callback = callback || function() {};

    debug("Move to "+ position + "%");

    var code = this._getCode(position);

    if (code == null) {
        callback(null);
        return;
    }

    var cmd = "1b0500";

    this._addToQueue(cmd, blind, code, callback, position);
}

QMotion.prototype._addToQueue = function(cmd, blind, code, callback, retVal) {
    this.queue.push([{"cmd": "1b00"}, {"cmd": "1b0100"}, {"cmd": cmd + blind.addr + code, "callback": callback, "blind": blind, "retVal": retVal}]);
    this._createClient();
}

QMotion.prototype._createClient = function() {
    if (this.tcpClient != null) {
        return
    }

    this.tcpClient = new net.Socket().unref();

    this.tcpClient.on('data', function(data) {
        debug("Recv: " + data.toString("hex"));

        var timeout = 10;

        if (this.item.callback !== undefined) {
            if (this.item.blind !== undefined) {
                this.item.blind._updatePositionState();
            }

            this.item.callback(this.item.retVal);
            timeout = 250;
        }

        this.item = null;

        setTimeout(function(self) {
            self._processQueue();
        }, timeout, this);
    }.bind(this));

    this.tcpClient.connect(TCP_PORT, this.ip, function() {
        this._processQueue();
    }.bind(this));
}

QMotion.prototype._getCode = function(value) {
    var code = null;

    switch(value) {
        case 0:
            code = '02';
            break;
        case 12.5:
            code = '0e';
            break;
        case 25:
            code = '0c';
            break;
        case 37.5:
            code = '0b';
            break;
        case 50:
            code = '08';
            break;
        case 62.5:
            code = '09';
            break;
        case 75:
            code = '07';
            break;
        case 87.5:
            code = '06';
            break;
        case 100:
            code = '01';
            break;
    }

    return code;
}

QMotion.prototype._persistPath = function() {
    var path = require('path');

    var home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
    return path.join(home, ".qmotion", "persist");
}

QMotion.prototype._processQueue = function() {
    if (this.queue.length == 0) {
        if (this.tcpClient != null) {
            this.tcpClient.removeAllListeners();
            this.tcpClient.destroy();
            this.tcpClient = null;
        }

        return;
    }

    this.item = this.queue.shift();

    if (this.item.constructor === Array) {
        if (this.item.length > 1) {
            this.queue.unshift(this.item.slice(1));
        }

        this.item = this.item[0];
    }

    debug("Send: " + this.item.cmd);
    this.tcpClient.write(Buffer(this.item.cmd, "hex"));
}

QMotion.prototype._readDevice = function() {
    var client = new net.Socket();
    var blinds = {};

    storage.initSync({dir: this._persistPath()});

    var reMsg = /^1604/;
    var reGroup = /^162c/;
    var reScene = /^163b/;

    const lenMsg = 12;
    const lenGroup = 92;
    const lenScene = 122;

    client.on('data', function(data) {
        var hexString = data.toString("hex");

        debug("TCP response: " + hexString);

        if (reMsg.test(hexString) && hexString.length > lenMsg) {
            hexString = hexString.substr(lenMsg);
        }

        oldHex = hexString

        do {
            var index;

            if (reGroup.test(oldHex)) {
                index = lenGroup;
            }
            else if (reScene.test(oldHex)) {
                index = lenScene;
            }

            hexString = oldHex.substr(0, index);
            oldHex = oldHex.substr(index);

            if (reScene.test(hexString) || reMsg.test(hexString)) {
                continue;
            }

            var item = new QMotionBlind(this, hexString);
            this.emit('blind', item);
            blinds[item.addr] = item;
        }
        while(oldHex.length >= index);

        client.end();
    }.bind(this));

    client.connect(TCP_PORT, this.ip, function() {
        client.write(Buffer("16020000", "hex"));
    });

    client.on('end', function() {
        this.emit('initialized', blinds);
    }.bind(this));

    client.on('error', function(err) {
        debug(err);
    });
}

var defaults = {currentPosition: 0, positionState: QMotion.PositionState.STOPPED, targetPosition: 0, targetActualPosition: 0};

function QMotionBlind(device, hexString) {
    events.EventEmitter.call(this);

    this.name = Buffer(hexString.substr(52), "hex").toString().replace(/\u0000+/, "");
    this.addr = hexString.substr(10,2) + hexString.substr(8,2) + hexString.substr(6,2);
    this.buffer = hexString;
    this.device = device;

    this.state = storage.getItemSync(this.addr);

    if (this.state === undefined) {
        this.state = {};
    }

    for (key in defaults) {
        if (this.state[key] === undefined) {
            this.state[key] = defaults[key];
        }
    }

    storage.setItemSync(this.addr, this.state);

    this._timer = null;
}
require('util').inherits(QMotionBlind, events.EventEmitter);

QMotionBlind.prototype.identify = function(callback) {
    callback = callback || function() {};

    var oldPos = this.state.currentPosition;
    var index = supportedPosition.indexOf(oldPos);
    var newPos = index < 6 ? supportedPosition[index + 1] : supportedPosition[index - 1];

    this.move(newPos, function() {
        setTimeout(function(self) {
            self.move(oldPos, function() {
                callback();
            });
        }, 30 * 1000 / supportedPosition.length, this);

        setTimeout(function(self) {
            if (self.state.targetPosition == oldPos) {
                self.move(oldPos);
            }
        }, (30 * 1000 / supportedPosition.length) + 1000, this);
    }.bind(this));
}

QMotionBlind.prototype.move = function(position, callback) {
    callback = callback || function() {};

    position = this._validatePosition(position);

    if (position == NaN) {
        callback(null);
    }

    if (this.state.targetPosition !== position) {
        this.state.targetPosition = position;
        debug('Emit targetPosition %s%', position);
        this.emit('targetPosition', position);
    }

    this.device.move(this, position, callback);
}

QMotionBlind.prototype._setTimer = function() {
    if (this._timer !== null) {
        return;
    }

    this._timer = setInterval(
        function(self) {
            var index = supportedPosition.indexOf(self.state.currentPosition);
            index = self.state.positionState == QMotion.PositionState.INCREASING ? index + 1 : index - 1;

            if (index < 0) {
                index = 0;
                clearInterval(self._timer);
            }
            else if (index > supportedPosition.length - 1) {
                index = supportedPosition.length - 1;
                clearInterval(self._timer);
            }

            self.state.currentPosition = supportedPosition[index];
            debug('Emit currentPosition %s%', self.state.currentPosition);
            self.emit("currentPosition", self.state.currentPosition);

            if (self.state.currentPosition == self.state.targetPosition) {
                clearInterval(self._timer);
                self._timer = null;
                self.state.positionState = QMotion.PositionState.STOPPED;
                self.emit("positionState", self.state.positionState);
            }

            storage.setItemSync(self.addr, self.state);
        },
        30 * 1000 / supportedPosition.length,
        this
    );
}

QMotionBlind.prototype._updatePositionState = function() {
    if (this.state.targetPosition > this.state.currentPosition) {
        this.state.positionState = QMotion.PositionState.INCREASING;
        this._setTimer();
    }
    else if (this.state.targetPosition < this.state.currentPosition) {
        this.state.positionState = QMotion.PositionState.DECREASING;
        this._setTimer();
    }
    else {
        this.state.positionState = QMotion.PositionState.STOPPED;
    }

    this.emit("positionState", this.state.positionState);
    storage.setItemSync(this.addr, this.state);
}

QMotionBlind.prototype._validatePosition = function(position) {
    var value = parseFloat(position);

    if (value == NaN) {
        return value;
    }

    if (supportedPosition.indexOf(value) == -1) {
        if (value < supportedPosition[0]) {
            value = supportedPosition[0];
        }
        else if (value > supportedPosition[supportedPosition.length - 1]) {
            value = supportedPosition[supportedPosition.length - 1];
        }
        else {
            for (i = 0; i < supportedPosition.length - 1 ; i++) {
                if (value < supportedPosition[i + 1]) {
                    value = (value > (supportedPosition[i] + 6.25)) ? supportedPosition[i + 1] : supportedPosition[i];
                    break;
                }
            }
        }
    }

    return value;
}

module.exports = QMotion;
