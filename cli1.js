var qmotion = require('./qmotion');

qmotion.setDebug(true);

var client = qmotion.search();

client.on("timeout", function(device) {
    console.log("No QSync devices found"); 
});

client.on("found", function(device) {
    var blind;
    var stdin = process.openStdin();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    function displayMsg() {
        var str = "";

        console.log();
        console.log("Select blind to control:");

        for (i = 0; i < device.blinds.length; i++) {
            str += (i + 1) + ": " + device.blinds[i].name + ", ";
        }

        console.log(str);
    }

    displayMsg();

    stdin.on('data', function (key) {
        var index = parseInt(String.fromCharCode(key[0])) - 1;
        if (blind == null) {
            switch (key[0]) {
                case 0x31: // 1
                case 0x32: // 2
                case 0x33: // 3
                case 0x34: // 4
                case 0x35: // 5
                case 0x36: // 6
                case 0x37: // 7
                case 0x38: // 8
                case 0x39: // 9
                    if (device.blinds[index]) {
                        blind = device.blinds[index];
                        console.log();
                        console.log("*** " + blind.name + " Selected ***");
                        console.log();
                        console.log("Select blind position:");
                        console.log("1: 0%, 2: 12.5%, 3: 25%, 4: 37.5%, 5: 50%, 6: 62.5%, 7: 75%, 8: 87.5:, 9: 100%");
                    }
                    break;
                case 0x03: // ctrl-c
                    console.log("Closing...");
                    process.stdin.pause();
                    break;
                default:
                    blind = null;
            }
        }
        else {
            switch (key[0]) {
                case 0x31: // 1
                case 0x32: // 2
                case 0x33: // 3
                case 0x34: // 4
                case 0x35: // 5
                case 0x36: // 6
                case 0x37: // 7
                case 0x38: // 8
                case 0x39: // 9
                    var position = index * 12.5;
                    console.log();
                    console.log("*** Move " + blind.name + " to " + position + "% ***");
                    blind.move(position);
                    break;
                case 0x03: // ctrl-c
                    console.log("Closing...");
                    process.stdin.pause();
                    break;
            }

            blind = null;
            displayMsg();
        }
    });
});
