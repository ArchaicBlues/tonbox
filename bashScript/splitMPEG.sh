#!/bin/bash
if [[ -n "$2" ]] && [[ -n $1 ]]; then
	echo split $1/$2 in 10min parts
	pause
	ffmpeg -i "$1/$2" -vcodec copy -acodec copy -segment_time 00:10:00 -f segment $2%02d.mpg
else
	echo no para 1,2: splitting ignored
fi

echo convert all mpg to mp4...
echo
echo Verzeichnis: $1
if [[ -n $1 ]]; then
	for i in $(find "$1" -type f -name "*.mpg"); do
	  out="${i%.mpg}.mp4"
	  ffmpeg -i "$i" -c:v libx264 -crf 18 -c:a aac "$out"
	  rm $i
	done
else 
	echo no para 1: convert mpg to mp4 ignored
fi
