# CG Controller

**HTML & JavaScript Based Graphics Generator**

![Screenshot](https://raw.githubusercontent.com/dv-anomaly/cg-controller/main/examples/screenshot1.png)

This is a minimal implementation of an HTML compatible graphics generator for livestreaming use. A work in progress, but usable.

![Example Output](https://raw.githubusercontent.com/dv-anomaly/cg-controller/main/examples/sample-output.png)

Supports 3 control channels. Additional resources required for rendering/output are not currently included or documented. The application expects these files to be in `[User's Documents]/CG Controller`. If you are interested in this project, open an issue, and I'll work on including some sample content.

![Example Output](https://raw.githubusercontent.com/dv-anomaly/cg-controller/main/examples/sample-output-2.png)

## New in This Version
- **Stateful Channel Management** - The playin and playout events are re-broadcast to synchronize clients when they connect/reconnect to the websocket server.
- **Improved Card Lifecycle** - Live cards are displayed in red across all control channels unless they have been edited and re-cued. Clicking a Live card will trigger a playout of the assigned channel.
- **e-Sword Bibles** - Support for unencrypted bibles in `.bbli` format.

![Screenshot](https://raw.githubusercontent.com/dv-anomaly/cg-controller/main/examples/screenshot2.png)

- **Auto Scaling Text & Line Breaks** - Implementation falls on the html display template will include with sample content in a future release.
- **General Bug Fixes**

## Roadmap
- **Improved Resource Selection** - Currently requires user to manually enter relative file path.
- **Newtek NDI Support** - Currently requires Chromium based Browser Source support in your streaming solution. Tested With vMix, and OBS + Browser Plugin.
- **Server/Client Architect** Currently a monolithic architecture with all controller services running on a single host. But can stream to any host on the network over HTML and Websockets on port `1337`.
- **Custom Card Templates** Currently a static set of cards in software, will allow custom cards to be defined in the HTML template at some point.
