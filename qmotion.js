var net    = require('net');
var events = require('events');
var sleep  = require('sleep');
var storage = require('node-persist');

var debug = false;
var port = 9760;
var supportedPosition = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];

function QMotion(ip) {
    events.EventEmitter.call(this);

    if (ip != undefined) {
        this.ip = ip;
        this.blinds = {};
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
    var udpPort = 9720;
    var dgram = require("dgram");    
    var server = dgram.createSocket("udp4");

    server.on("error", function (err) {
        if (debug) {
            console.log("UDP error:\n" + err.stack);
        }

        server.close();
        server.emit("timeout");
    });

    server.on("listening", function () {
        if (debug) {
            var address = server.address();
            console.log("UDP listening " + address.address + ":" + address.port);
        }

        var message = new Buffer("00", "hex");

        server.send(message, 0, message.length, 9720, "255.255.255.255", function(err) {
            if (err == null) {
                return;
            }

            if (debug) {
                console.log("UDP error:\n" + err.stack);
            }

            server.close();
            server.emit("timeout");
        });
    });

    server.on("message", function (msg, rinfo) {
        if (msg == undefined || msg.toString("hex") == "00") {
            return;
        }

        if (debug) {
            console.log("UDP response: " + msg.toString("hex") + " from " + rinfo.address + ":" + rinfo.port);
        }

        var device = new QMotion(rinfo.address);

        device.on('initialized', function() {
            server.close();
            server.emit("found", device);
        });
    });

    server.bind(9720, "0.0.0.0", function() {
        server.setBroadcast(true);
    });

    return server;
}

QMotion.setDebug = function(d){
    debug = d;
}

QMotion.prototype.identify = function(blind, cb) {
    var self = this;

    var oldPos = blind.state.currentPosition;
    var index = supportedPosition.indexOf(oldPos);
    var newPos = index < 6 ? supportedPosition[index + 1] : supportedPosition[index - 1];

    if(typeof cb == "undefined") cb=function(){};

    this.move(blind, newPos, function() {
        sleep.sleep(2);

        self.move(blind, oldPos, function() {
            cb();
        });
    });
}

QMotion.prototype.move = function(blind, position, cb) {
    var code;

    if(typeof cb == "undefined") cb=function(){};

    var value = parseFloat(position);

    if (value == NaN) {
        cb(null);
        return;
    }

    if (supportedPosition.indexOf(value) == -1) {
        if (value < supportedPosition[0]) {
            position = supportedPosition[0];
        }
        else if (value > supportedPosition[supportedPosition.length - 1]) {
            position = supportedPosition[supportedPosition.length - 1];
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

    if (debug) {
        console.log("Move to "+ value + "%");
    }

    var code = this._getCode(value);

    if (code == null) {
        cb(null);
        return;
    }

    var cmd = "1b0500";

    this._addToQueue(cmd, blind, code, cb, value);
}

QMotion.prototype._addToQueue = function(cmd, blind, code, cb, retVal) {
    var self = this;

    this.queue.push({"cmd": "1b00"});
    this.queue.push({"cmd": "1b0100"});
    this.queue.push({"cmd": cmd + blind.addr + code, "cb": cb, "blind": blind, "retVal": retVal});

    this._createClient();
}

QMotion.prototype._createClient = function() {
    var self = this;

    if (this.tcpClient != null) {
        return
    }

    this.tcpClient = new net.Socket();

    this.tcpClient.connect(port, self.ip, function() {
        self._processQueue();
    });
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
    var self = this;

    if (this.queue.length == 0) {
        if (this.tcpClient != null) {
            self.tcpClient.destroy();
            self.tcpClient = null;
        }

        return;
    }

    this.tcpClient.on('data', function(data) {
        if (debug) {
            console.log("Recv: " + data.toString("hex"));
            console.log("---------");
        }

        if (typeof item.cb == "undefined") {
            if (self.queue.length != 0) {
                item = self.queue.shift();

                if (debug) {
                    console.log("Send: " + item.cmd);
                }

                self.tcpClient.write(Buffer(item.cmd, "hex"));
            }
            else {
                self.tcpClient.destroy();
                self.tcpClient = null;
            }
        }
        else {
            if (typeof item.blind != "undefined") {
                item.blind._updateState();
            }

            item.cb(item.retVal);
            self.tcpClient.destroy();
            self.tcpClient = null;

            if (self.queue.length != 0) {
                sleep.usleep(750000);
                self._createClient();
            }
        }
    });

    var item = this.queue.shift();

    if (debug) {
        console.log("Send: " + item.cmd);
    }

    this.tcpClient.write(Buffer(item.cmd, "hex"));
}

QMotion.prototype._readDevice = function() {
    var self = this;
    var client = new net.Socket();

    storage.initSync({dir: this._persistPath()});

    var reMsg = /^1604/;
    var reGroup = /^162c/;
    var reScene = /^163b/;

    const lenMsg = 12;
    const lenGroup = 92;
    const lenScene = 122;

    client.on('data', function(data) {
        var hexString = data.toString("hex");

        if (debug) {
            console.log("TCP response: " + hexString);
        }

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
                index = 122   
            }

            hexString = oldHex.substr(0, index);
            oldHex = oldHex.substr(index);

            if (reScene.test(hexString) || reMsg.test(hexString)) {
                continue;
            }

            var item = new QMotionBlind(self, hexString);

            self.blinds[item.addr] = item;
        }
        while(oldHex.length >=index);

        client.end();
    });

    client.connect(port, self.ip, function() {
        client.write(Buffer("16020000", "hex"));
    });

    client.on('end', function() {
        self.emit('initialized', self.blinds);
    });
}

function QMotionBlind(device, hexString) {
    events.EventEmitter.call(this);

    this.name = Buffer(hexString.substr(52), "hex").toString().replace(/\u0000+/, "");
    this.addr = hexString.substr(10,2) + hexString.substr(8,2) + hexString.substr(6,2);
    this.buffer = hexString;
    this.device = device;

    this.state = storage.getItemSync(this.addr);

    if (this.state == undefined) {
        this.state = {
            currentPosition: 0,
            positionState: QMotion.PositionState.STOPPED,
            targetPosition: 0
        }

        storage.setItemSync(this.addr, this.state);
    }

    this._timer = null;
}
require('util').inherits(QMotionBlind, events.EventEmitter);

QMotionBlind.prototype.identify = function(cb) {
    this.device.identify(this, cb);
}

QMotionBlind.prototype.move = function(position, cb) {
    this.state.targetPosition = position;
    this.device.move(this, position, cb);
}

QMotionBlind.prototype._setTimer = function() {
    var self = this;
    this._timer = setInterval(
        function() {
            var index = supportedPosition.indexOf(self.state.currentPosition);
            index = self.state.positionState == QMotion.PositionState.INCREASING ? index + 1 : index - 1;

            self.state.currentPosition = supportedPosition[index];
            self.emit("currentPosition", self);

            if (self.state.currentPosition == self.state.targetPosition) {
                clearInterval(self._timer);
                self.state.positionState = QMotion.PositionState.STOPPED;
                self.emit("positionState", self);
            }

            storage.setItemSync(self.addr, self.state);
        },
        30 * 1000 / supportedPosition.length
    );
}

QMotionBlind.prototype._updateState = function() {
    clearInterval(this._timer);

    if (this.state.targetPosition > this.state.currentPosition) {
        this.state.positionState = QMotion.PositionState.INCREASING;
        this._setTimer();
        this.emit("positionState", this);
    }
    else if (this.state.targetPosition < this.state.currentPosition) {
        this.state.positionState = QMotion.PositionState.DECREASING;
        this._setTimer();
        this.emit("positionState", this);
    }
    else {
        this.state.positionState = QMotion.PositionState.STOPPED;
        this.emit("positionState", this);
    }

    storage.setItemSync(this.addr, this.state);
}

module.exports = QMotion;
