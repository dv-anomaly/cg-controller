**HTML & JavaScript Based Graphics Generator**

![Screenshot](https://raw.githubusercontent.com/dv-anomaly/cg-controller/main/examples/screenshot1.png)

This is a minimal implementation of an HTML compatible graphics generator for livestreaming use. A work in progress, but usable.

![Example Output](https://raw.githubusercontent.com/dv-anomaly/cg-controller/main/examples/sample-output.png)

Supports 3 control channels. Additional resources required for rendering/output are not currently included or documented. The application expects these files to be in `[User's Documents]/CG Controller`. If you are interested in this project, open an issue, and I'll work on including some sample content.

![Example Output](https://raw.githubusercontent.com/dv-anomaly/cg-controller/main/examples/sample-output-2.png)

## Features

- **File Browser** - Images and Video fields use a custom file browser for easier selection.

![Screenshot](https://raw.githubusercontent.com/dv-anomaly/cg-controller/main/examples/screenshot3.png)

- **Hotkeys**
  - Play In - Spacebar or Enter
  - Change Cue - Up and Down Arrows
  - Play Out Channel - Number Row 1, 2, & 3
  - Copy and Paste Cards - Ctrl + C & Ctrl + V
    
- **e-Sword Bibles** - Support for unencrypted bibles in `.bbli` format, with flexible indexing.
  - Supports e-Sword shorthand. Eg. Jhn (John)
  - Single Schapter books can have the chapter omitted. Eg. Jude 1-5
  - Will attempt a partial lookup for incomplete books. Eg 1 Thes (same as 1 thessalonians)

![Screenshot](https://raw.githubusercontent.com/dv-anomaly/cg-controller/main/examples/screenshot2.png)


## Roadmap
- **Newtek NDI Support** - Currently requires Chromium based Browser Source support in your streaming solution. Tested With vMix, and OBS + Browser Plugin.
- **Server/Client Architecture** Currently a monolithic architecture with all controller services running on a single host. But can stream to any host on the network over HTML and Websockets on port `1337`.
- **Custom Card Templates** Currently a static set of cards in software, will allow custom cards to be defined in the HTML template at some point.
