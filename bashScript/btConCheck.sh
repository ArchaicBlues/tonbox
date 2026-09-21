#!/bin/bash

#./btConCheck [sdcard]

#    //Das Bash-Script "btConCheck.sh" checkt ob ein Bluetooth Device mir PI verbunden ist, 
#	 //wenn ja, wird ein File "btDevice" generiert;
#    //wenn nein, wird "btDevice" gelöscht
#    //Das File wird in funcbluetooth.js "get_btDevice()" geprüft ob vorhanden
#	 //Wenn ja, dann wird das Bluetooth Zeichen visualisiert

c=0
#echo $i
rm -f /home/pi/ArchaicNodeEJS/help/btDevice
#run forever
while [ 1 ]
do
	TEST=$(bluetoothctl devices Connected)
	#echo $TEST
	if [[ $TEST == *'Device'* ]]; then
		if [ $c == 0 ]; then
			touch /home/pi/ArchaicNodeEJS/help/btDevice
			c=1
			echo "connected"
#			amixer -c 0 sset PCM Playback Volume 100% 100% unmute
#			echo "100%"
		fi
	else
		if [ $c == 1 ]; then
			rm -f /home/pi/ArchaicNodeEJS/help/btDevice
			c=0
			echo "not connected"
#			amixer -c $1 sset 'Analogue' 0% 0% unmute
#			echo "0%"
		fi
	fi
	sleep 2
done
