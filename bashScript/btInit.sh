#!/usr/bin/expect -f
set timeout -1   ;# unendlich blockieren (0 % CPU)

spawn bluetoothctl

# Initiale Konfiguration
send "default-agent\r"
send "discoverable on\r"
send "pairable on\r"

# Event-Loop
expect {
    -re "\\(yes/no\\)" {
        send "yes\r"
        exp_continue
    }

    -re "Authorize service" {
        send "yes\r"
        exp_continue
    }

    -re "Request confirmation" {
        send "yes\r"
        exp_continue
    }

    eof {
        exit
    }
}
