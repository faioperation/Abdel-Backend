import fs from "fs";
import path from "path";
import { exec } from "child_process";
import axios from "axios";

// ==========================================
// CONFIGURATION
// ==========================================
const BACKEND_URL = "http://localhost:8000/api";
const PRINTER_MAC = "00:11:62:AA:BB:CC";
const POLL_INTERVAL_MS = 5000;
const TEMP_FILE_NAME = "temp-receipt.txt";
// ==========================================

console.log("=============================================");
console.log("   🖨️  LOCAL USB PRINTER BRIDGE STARTED  🖨️   ");
console.log("=============================================");
console.log(`Backend URL: ${BACKEND_URL}`);
console.log(`Printer MAC: ${PRINTER_MAC}`);
console.log(`Interval:    ${POLL_INTERVAL_MS / 1000} seconds`);
console.log("---------------------------------------------");
console.log("💡 Tip: Make sure your USB printer is set as");
console.log("   the 'Default Printer' in Windows Settings.");
console.log("=============================================\n");

async function pollServer() {
  try {
    const pollResponse = await axios.post(
      `${BACKEND_URL}/webhook/printer/poll`,
      {
        printerMAC: PRINTER_MAC,
        statusCode: "200",
      },
    );

    if (
      pollResponse.status === 200 &&
      pollResponse.data &&
      pollResponse.data.jobReady
    ) {
      const { jobToken } = pollResponse.data;
      console.log(
        `[${new Date().toLocaleTimeString()}] 🔔 New print job found! Token: ${jobToken}`,
      );

      const contentResponse = await axios.get(
        `${BACKEND_URL}/webhook/printer/poll`,
        {
          params: { token: jobToken },
        },
      );

      const receiptText = contentResponse.data;

      const filePath = path.resolve(TEMP_FILE_NAME);
      fs.writeFileSync(filePath, receiptText, "utf-8");

      console.log(
        `[${new Date().toLocaleTimeString()}] 📄 Receipt downloaded. Printing to default USB printer...`,
      );

      const printCommand = `powershell -Command "Get-Content -Path '${filePath}' -Encoding utf8 | Out-Printer"`;

      exec(printCommand, async (error, stdout, stderr) => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        if (error) {
          console.error(
            `[${new Date().toLocaleTimeString()}] ❌ Printing failed:`,
            error.message,
          );
          return;
        }

        console.log(
          `[${new Date().toLocaleTimeString()}] ✅ Printed successfully! Sending confirmation...`,
        );

        try {
          await axios.delete(`${BACKEND_URL}/webhook/printer/poll`, {
            params: { token: jobToken, code: "200" },
          });
          console.log(
            `[${new Date().toLocaleTimeString()}] 🎉 Job confirmed & marked as completed in DB.\n`,
          );
        } catch (confirmErr) {
          console.error(
            `[${new Date().toLocaleTimeString()}] ⚠️ Failed to send confirmation to server:`,
            confirmErr.message,
          );
        }
      });
    } else {
    }
  } catch (error) {
    if (error.response && error.response.status === 204) {
    } else {
      console.error(
        `[${new Date().toLocaleTimeString()}] ❌ Error during polling:`,
        error.message,
      );
    }
  }

  setTimeout(pollServer, POLL_INTERVAL_MS);
}

pollServer();
