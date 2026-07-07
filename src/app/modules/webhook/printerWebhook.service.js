import prisma from "../../prisma/client.js";

const parseItemsFromNotes = (notes) => {
  if (!notes) return [];
  const trimmed = notes.trim();

  // Try JSON first
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      const itemsArray = Array.isArray(parsed) ? parsed : [parsed];
      return itemsArray.map((item) => {
        const qty = Number(item.quantity || item.qty || 1);
        const name =
          item.name ||
          item.itemName ||
          item.item_name ||
          item.product ||
          item.productName ||
          "Unknown Item";
        const size =
          item.size || item.itemSize || item.item_size || item.variant || "";
        return { quantity: qty, name, size };
      });
    } catch (e) {
      // Fallback
    }
  }

  // Fallback text parsing
  const lines = trimmed.split(/[\r\n;]+/);
  const items = [];

  for (let line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    const regex = /^(?:(\d+)\s*[xX]\s+)?([^(]+)(?:\(([^)]+)\))?$/;
    const match = cleanLine.match(regex);

    if (match) {
      const quantity = match[1] ? parseInt(match[1], 10) : 1;
      const name = match[2].trim();
      const size = match[3] ? match[3].trim() : "";
      items.push({ quantity, name, size });
    } else {
      items.push({ quantity: 1, name: cleanLine, size: "" });
    }
  }

  return items;
};

const formatReceipt = (order, restaurant) => {
  const width = 32; // Standard 58mm/80mm compatible text receipt width
  const border = "================================";
  const dashLine = "--------------------------------";

  const centerText = (text) => {
    if (text.length >= width) return text.slice(0, width);
    const leftPad = Math.floor((width - text.length) / 2);
    return " ".repeat(leftPad) + text;
  };

  const centerTextMultiLine = (text) => {
    if (!text) return [];
    const words = text.split(" ");
    const linesArr = [];
    let currentLine = "";

    for (const word of words) {
      if ((currentLine + " " + word).trim().length <= width) {
        currentLine = (currentLine + " " + word).trim();
      } else {
        if (currentLine) linesArr.push(centerText(currentLine));
        currentLine = word;
      }
    }
    if (currentLine) linesArr.push(centerText(currentLine));
    return linesArr;
  };

  const formatLine = (left, right) => {
    const spacesNeeded = width - left.length - right.length;
    if (spacesNeeded <= 0) {
      return left.slice(0, width - right.length - 1) + " " + right;
    }
    return left + " ".repeat(spacesNeeded) + right;
  };

  const lines = [];
  lines.push(border);
  lines.push(centerText(restaurant.name.toUpperCase()));
  if (restaurant.address) {
    const addressLines = centerTextMultiLine(restaurant.address);
    lines.push(...addressLines);
  }
  if (restaurant.phone) lines.push(centerText(restaurant.phone));
  if (restaurant.email) lines.push(centerText(restaurant.email));
  lines.push(border);

  const orderNumStr = order.order_number
    ? `#${order.order_number}`
    : `#${order.id.slice(0, 8)}`;
  lines.push(formatLine(`Order: ${orderNumStr}`, "Type: VOICE CALL"));

  const onlyDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
      })
    : "N/A";

  const onlyTime = order.created_at
    ? new Date(order.created_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "N/A";

  lines.push(formatLine(`Date: ${onlyDate}`, `Time: ${onlyTime}`));
  lines.push(dashLine);

  if (order.customer) {
    lines.push(`Customer: ${order.customer.name || "Guest"}`);
    lines.push(`Phone: ${order.customer.phone || "N/A"}`);
    lines.push(dashLine);
  }

  lines.push("ITEMS:");
  const items = parseItemsFromNotes(order.notes);
  for (const item of items) {
    const sizeStr = item.size && item.size !== "N/A" ? ` (${item.size})` : "";
    const itemLabel = `${item.quantity}x ${item.name}${sizeStr}`;
    lines.push(itemLabel);
  }
  lines.push(dashLine);

  lines.push(
    formatLine("Subtotal:", `kr. ${(order.subtotal || 0).toFixed(2)}`),
  );
  if (order.tax > 0) {
    lines.push(formatLine("Tax:", `kr. ${(order.tax || 0).toFixed(2)}`));
  }
  lines.push(formatLine("TOTAL:", `kr. ${(order.total || 0).toFixed(2)}`));
  lines.push(dashLine);

  const isDelivery =
    order.order_type && order.order_type.toLowerCase() === "delivery";

  if (isDelivery) {
    lines.push("Order Type: DELIVERY");
    if (order.delivery_address) {
      lines.push("Delivery Address:");
      const words = order.delivery_address.split(" ");
      let currentLine = "";
      for (const word of words) {
        if ((currentLine + " " + word).trim().length <= width) {
          currentLine = (currentLine + " " + word).trim();
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
    } else {
      lines.push("Delivery Address: N/A");
    }
  } else {
    lines.push("Order Type: PICKUP");
    const pickupTime = order.pickup_time
      ? new Date(order.pickup_time).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
          hour12: true,
        })
      : "Asap";
    lines.push(`Pickup Time: ${pickupTime}`);
  }

  // Print user notes/summary if it wasn't parsed as JSON
  const trimmedNotes = order.notes ? order.notes.trim() : "";
  const isJsonNotes =
    (trimmedNotes.startsWith("[") && trimmedNotes.endsWith("]")) ||
    (trimmedNotes.startsWith("{") && trimmedNotes.endsWith("}"));
  if (order.notes && !isJsonNotes && order.notes.length > 0) {
    lines.push(dashLine);
    lines.push("Notes:");
    lines.push(order.notes);
  }

  lines.push(border);
  lines.push(centerText("Thank you for your order!"));
  lines.push(border);
  lines.push("\n\n\n\n"); // Extra padding for tear off

  return lines.join("\n");
};

const handlePrinterPoll = async (printerMAC, statusCode) => {
  if (!printerMAC) {
    console.warn("CloudPRNT: Missing printerMAC in poll request");
    return { jobReady: false };
  }

  const cleanMac = printerMAC.toLowerCase().replace(/[:-]/g, "");

  // 1. Locate the printer
  let printer = await prisma.printers.findFirst({
    where: {
      OR: [
        { serial_number: printerMAC },
        { serial_number: printerMAC.toLowerCase() },
        { serial_number: cleanMac },
      ],
    },
  });

  if (!printer) {
    console.warn(
      `CloudPRNT: Unregistered printer MAC ${printerMAC} attempted to poll`,
    );
    return { jobReady: false };
  }

  // 2. Update printer status and last_seen
  let status = "online";
  // Check if statusCode indicates an error (4xx/5xx)
  if (
    statusCode &&
    (statusCode.startsWith("4") || statusCode.startsWith("5"))
  ) {
    console.warn(
      `CloudPRNT: Printer ${printer.id} reported error status code ${statusCode}`,
    );
  }

  await prisma.printers.update({
    where: { id: printer.id },
    data: {
      status,
      last_seen: new Date(),
    },
  });

  // 3. Find oldest pending job
  const pendingJob = await prisma.print_jobs.findFirst({
    where: {
      printer_id: printer.id,
      status: "pending",
    },
    orderBy: {
      created_at: "asc",
    },
  });

  if (pendingJob) {
    // Lock the job to preventing duplicate retrieval on next poll
    await prisma.print_jobs.update({
      where: { id: pendingJob.id },
      data: {
        status: "printing",
      },
    });

    return {
      jobReady: true,
      mediaTypes: ["text/plain"],
      jobToken: pendingJob.id,
    };
  }

  return { jobReady: false };
};

const getPrintJobContent = async (jobToken) => {
  if (!jobToken) {
    throw new Error("Job token is required");
  }

  const job = await prisma.print_jobs.findUnique({
    where: { id: jobToken },
    include: {
      order: {
        include: {
          customer: true,
          restaurant: true,
        },
      },
    },
  });

  if (!job) {
    throw new Error(`Print job not found for token ${jobToken}`);
  }

  return formatReceipt(job.order, job.order.restaurant);
};

const confirmPrintJob = async (jobToken, code) => {
  if (!jobToken) {
    throw new Error("Job token is required");
  }

  const job = await prisma.print_jobs.findUnique({
    where: { id: jobToken },
  });

  if (!job) {
    throw new Error(`Print job not found for token ${jobToken}`);
  }

  const isSuccess =
    code && (code.startsWith("2") || code === "0" || code === "200"); // 200, 200 OK, or success status code

  await prisma.print_jobs.update({
    where: { id: jobToken },
    data: {
      status: isSuccess ? "completed" : "failed",
      retry_count: isSuccess ? job.retry_count : { increment: 1 },
    },
  });

  // Update printer last_seen
  await prisma.printers.update({
    where: { id: job.printer_id },
    data: {
      last_seen: new Date(),
    },
  });

  return { success: true };
};

export const PrinterWebhookService = {
  handlePrinterPoll,
  getPrintJobContent,
  confirmPrintJob,
  formatReceipt,
};
