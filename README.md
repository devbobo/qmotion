# JS Library for QMotion Blinds

A NodeJS client for the QMotion blinds (using a QSync device) based on my observations of the network protocol using tcpdump and Wireshark.

# Install
To install from NPM, do ```npm install qmotion```, or just clone the github repo (but you'll need to run ```npm install``` in this dir to get the "clone" dependency if you get from github).

If you install form NPM, then do ```require("qmotion");```. If you cloned the github repo then you'll need to do something like ```require("./qmotion");``` (ie specify the path to the dir you cloned into).

# Files

There is 1 main file (qmotion.js) which is all you need plus some example CLI
apps:

  * cli1.js controls individual blinds

# Usage

The file [cli1.js](cli1.js) is a working example.

To begin with, you must include the library and you can then either create a new QMotion object with a given ip address or find a QSync device using the search function.

Hard coded ip example:
```JavaScript
var qmotion = require('./qmotion');
var device   = new qmotion("192.168.0.1");
```

Network discovery example:
```JavaScript
var qmotion = require('./qmotion');
var client = qmotion.search();

client.on("found", function(device) {
    ...
});
```

Target an individual blind:

```Javascript
var blind = device.blinds[0];
blind.move(50); // open blind to 50%
```

If you want to see debug messages then call

```JavaScript
qmotion.setDebug(true);
```
