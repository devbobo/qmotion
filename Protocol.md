
# Observed QSync network protocol

# Find QSync Devices
**Request** (UDP broadcast port 9720)
```
00
```

**Response**
```
nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn 00 mm mm mm mm mm mm 01 00 0B A1 00 00 FF FF
```

**nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn** denotes the device's name

**mm mm mm mm mm mm** denotes the device's mac address

# List QSync Contents
**Request** (TCP port 9760)
```
16 02 00 00
```
The response lists both groups and scenes.

**Response** (Group element)
```
16 2c 01 cc bb aa 00 ff ff ff ff 48 88 ec f6 9e 0e 56 6c b0 eb 00 00 01 c0 03
nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn
```
**aa bb cc** denotes the group's address (**note:** in reverse order) 

**nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn nn** denotes the group's name

# Control a blind
The QMotion iPhone app doesn't expose the blinds directly, so I created a group for each blind and then use that group to control each blind.

**Request** (TCP port 9760)
```
1b 05 00 aa aa aa xx
```

**aa aa aa** denotes the group's address eg: 0d f8 d3

**xx** denotes the command as below...
```
 01 - Open to 100 %
 02 - Close to 0 %
 03
 04 - Stop downwards movement
 05
 06 - Open to 87.5%
 07 - Open to 75%
 08 - Open to 50%
 09 - Open to 62.5%
 0a -
 0b - Open to  37.5%
 0c - Open to 25%
 0d - 
 0e - Open to 12.5%
```

This code has been written as a backend to for the homebridge-qmotion plugin, I found that in order to control multiple devices at the same time (eg: close all my blinds), I had to send the following set of commands or only one blind would be activated...

```
1b 00
1b 01 00
1b 05 00 aa aa aa xx
```
