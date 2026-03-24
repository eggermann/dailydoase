# Open Remote

Remote Mac mini access:

```bash
ssh dominikeggermann@100.127.80.84
```

Remote desktop:

```bash
open vnc://100.127.80.84
```

Local Wi-Fi remote desktop:

```bash
open vnc://192.168.2.219
```

Current status:

- Tailscale address: `100.127.80.84`
- Hostname: `dominiks-Mac-mini.local`
- User: `dominikeggermann`
- Wi-Fi network: `WLAN-211976`
- Wi-Fi IP: `192.168.2.219`
- Router: `192.168.2.1`

Notes:

- The Mac mini is now connected to Wi-Fi and should remain reachable over Tailscale even if Ethernet is unplugged.
- On the same local Wi-Fi, you can also connect using `192.168.2.219`.
- Screen Sharing is available on port `5900`.

## Raspberry Pi

Remote Raspberry Pi access:

```bash
ssh pi@100.119.210.62
```

Remote desktop:

```bash
open vnc://100.119.210.62
```

Local network remote desktop:

```bash
open vnc://192.168.3.3
```

Current status:

- Tailscale address: `100.119.210.62`
- Hostname: `raspberrypi`
- User: `pi`
- Local IP: `192.168.3.3`

Notes:

- The Raspberry Pi is reachable over Tailscale by SSH and VNC.
- VNC is enabled and listening on port `5900`.
- For remote desktop login, use the `pi` account and its Raspberry Pi password.
