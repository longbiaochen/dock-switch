const test = require("node:test");
const assert = require("node:assert/strict");

const {
    extractGokit5PortPathsFromIoregText,
    findGokit5SerialPort,
    mapGokit5ButtonToTarget,
    parseGokit5ButtonLine,
    shouldDispatchButton
} = require("../src/gokit5-serial");

test("parseGokit5ButtonLine extracts stable host button events from ESP logs", () => {
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:minus"), "minus");
    assert.equal(parseGokit5ButtonLine("I (123) Gokit5: GOKIT5_HOST_BUTTON:voice"), "voice");
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:green\r"), "green");
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:plus extra"), "plus");
    assert.equal(parseGokit5ButtonLine("I (123) VolcRTCApp: Heap Info"), "");
    assert.equal(parseGokit5ButtonLine("GOKIT5_HOST_BUTTON:volume_up"), "");
});

test("mapGokit5ButtonToTarget maps the four physical keys to display targets", () => {
    assert.equal(mapGokit5ButtonToTarget("minus"), "side_left");
    assert.equal(mapGokit5ButtonToTarget("voice"), "external");
    assert.equal(mapGokit5ButtonToTarget("green"), "side_right");
    assert.equal(mapGokit5ButtonToTarget("plus"), "internal");
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
