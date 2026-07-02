const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
    createGokit5SerialListener,
    createConfiguredSerialReadStream,
    extractGokit5PortPathsFromIoregText,
    findGokit5SerialPort,
    mapGokit5ButtonToAction,
    parseGokit5ButtonLine,
    shouldDispatchButton
} = require("../src/gokit5-serial");

test("parseGokit5ButtonLine extracts stable host button events from ESP logs", () => {
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:minus"), "minus");
    assert.equal(parseGokit5ButtonLine("I (123) Gokit5: GOKIT5_HOST_BUTTON:voice"), "voice");
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:plus extra"), "plus");
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:green"), "green");
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:switch"), "switch");
    assert.equal(parseGokit5ButtonLine("I (123) VolcRTCApp: Heap Info"), "");
});

test("parseGokit5ButtonLine rejects removed plus aliases", () => {
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:+"), "");
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:add"), "");
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:volume_up"), "");
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:volume+"), "");
});

test("mapGokit5ButtonToAction maps physical keys to app placement actions", () => {
    assert.deepEqual(mapGokit5ButtonToAction("minus"), {
        name: "SmartShadow",
        placement: "side_left_fill",
        open_path: "/Applications/SmartShadow.app"
    });
    assert.deepEqual(mapGokit5ButtonToAction("voice"), {
        name: "Codex",
        placement: "external_fill"
    });
    assert.deepEqual(mapGokit5ButtonToAction("switch"), {
        name: "Claude",
        placement: "side_right_fill",
        open_path: "/Applications/Claude.app"
    });
    assert.deepEqual(mapGokit5ButtonToAction("green"), {
        name: "Claude",
        placement: "side_right_fill",
        open_path: "/Applications/Claude.app"
    });
    assert.deepEqual(mapGokit5ButtonToAction("plus"), {
        name: "X",
        kind: "web_app",
        placement: "internal_fill",
        open_path: "~/Applications/Chromium Apps.localized/X.app",
        app_url: "https://x.com/?utm_source=homescreen&utm_medium=shortcut"
    });
    assert.equal(mapGokit5ButtonToAction("+"), null);
    assert.equal(mapGokit5ButtonToAction("add"), null);
    assert.equal(mapGokit5ButtonToAction("volume_up"), null);
    assert.equal(mapGokit5ButtonToAction("volume-up"), null);
    assert.equal(mapGokit5ButtonToAction("volume+"), null);
});

test("shouldDispatchButton debounces repeated events per button", () => {
    const last = new Map();
    assert.equal(shouldDispatchButton("minus", 1000, last, 250), true);
    assert.equal(shouldDispatchButton("minus", 1100, last, 250), false);
    assert.equal(shouldDispatchButton("voice", 1100, last, 250), true);
    assert.equal(shouldDispatchButton("minus", 1300, last, 250), true);
});

test("extractGokit5PortPathsFromIoregText finds the Espressif USB serial suffix", () => {
    const sample = `
    +-o USB JTAG/serial debug unit@00131000  <class IOUSBHostDevice>
      |   "idProduct" = 4097
      |   "USB Product Name" = "USB JTAG_serial debug unit"
      |   "kUSBSerialNumberString" = "94:A9:90:10:E5:F4"
      |   "USB Vendor Name" = "Espressif"
      |   "idVendor" = 12346
      +-o AppleUSBACMData
        |   "IOTTYSuffix" = "13101"
    `;

    assert.deepEqual(extractGokit5PortPathsFromIoregText(sample), [
        "/dev/cu.usbmodem13101"
    ]);
});

test("findGokit5SerialPort prefers env override and then detected Espressif ports", () => {
    const fsModule = {
        existsSync(path) {
            return path === "/dev/cu.override" || path === "/dev/cu.usbmodem13101";
        },
        readdirSync() {
            return ["cu.usbmodem99999"];
        }
    };

    assert.equal(findGokit5SerialPort({
        fs: fsModule,
        env: { GOKIT5_SERIAL_PORT: "/dev/cu.override" }
    }), "/dev/cu.override");

    const ioregText = `
    +-o USB JTAG/serial debug unit@00131000  <class IOUSBHostDevice>
      |   "idProduct" = 4097
      |   "USB Product Name" = "USB JTAG_serial debug unit"
      |   "USB Serial Number" = "94:A9:90:10:E5:F4"
      |   "USB Vendor Name" = "Espressif"
      |   "idVendor" = 12346
      +-o AppleUSBACMData
        |   "IOTTYSuffix" = "13101"
    `;

    assert.equal(findGokit5SerialPort({
        fs: fsModule,
        env: {},
        runCommand: () => ({ status: 0, stdout: ioregText })
    }), "/dev/cu.usbmodem13101");
});

test("createGokit5SerialListener keeps the serial fd open while applying stty", () => {
    const events = [];
    const stream = new EventEmitter();
    stream.destroy = () => {
        events.push("destroy");
    };

    const fsModule = {
        openSync(path, flags) {
            events.push(["open", path, flags]);
            return 53;
        },
        closeSync(fd) {
            events.push(["close", fd]);
        },
        createReadStream(path, options) {
            events.push(["read", path, options.fd, options.autoClose, options.encoding]);
            return stream;
        }
    };

    const listener = createGokit5SerialListener({
        fs: fsModule,
        findPort: () => "/dev/cu.usbmodem13101",
        runCommand(command, args) {
            events.push(["stty", command, args]);
            return { status: 0 };
        }
    });

    listener.start();

    assert.deepEqual(events.slice(0, 3), [
        ["open", "/dev/cu.usbmodem13101", "r"],
        ["stty", "stty", [
            "-f",
            "/dev/cu.usbmodem13101",
            "115200",
            "raw",
            "-echo",
            "-icanon",
            "min",
            "1",
            "time",
            "0",
            "clocal",
            "-hupcl"
        ]],
        ["read", null, 53, true, "utf8"]
    ]);

    listener.stop();
    assert.equal(events.at(-1), "destroy");
});

test("createGokit5SerialListener dispatches plus to the X internal-fill action", () => {
    const stream = new EventEmitter();
    stream.destroy = () => {};
    const actions = [];

    const listener = createGokit5SerialListener({
        debounceMs: 0,
        findPort: () => "/dev/cu.usbmodem13101",
        createReadStream: () => stream,
        onAction: (action, event) => {
            actions.push({ action, button: event.button, line: event.line });
        }
    });

    listener.start();
    stream.emit("data", "I (123) Gokit5: GOKIT5_HOST_BUTTON:plus\n");

    assert.equal(actions.length, 1);
    assert.deepEqual(actions[0].action, mapGokit5ButtonToAction("plus"));
    assert.equal(actions[0].button, "plus");
    assert.match(actions[0].line, /plus/);

    listener.stop();
});

test("createConfiguredSerialReadStream closes the held fd when stty fails", () => {
    const events = [];
    const fsModule = {
        openSync(path, flags) {
            events.push(["open", path, flags]);
            return 53;
        },
        closeSync(fd) {
            events.push(["close", fd]);
        },
        createReadStream() {
            events.push(["read"]);
            throw new Error("read stream should not be created");
        }
    };

    assert.throws(() => createConfiguredSerialReadStream("/dev/cu.usbmodem13101", 115200, {
        fs: fsModule,
        runCommand(command, args) {
            events.push(["stty", command, args]);
            return { status: 1 };
        }
    }), /Failed to configure serial port/);

    assert.deepEqual(events.map(event => event[0]), ["open", "stty", "close"]);
});
