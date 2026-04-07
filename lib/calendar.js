const { google } = require("googleapis");

const TIMEZONE = "America/Los_Angeles";
const SLOT_DURATION_MIN = 30;

// Mon-Fri 12:00 PM - 5:00 PM PT
const OPEN_WINDOWS = {
  1: [{ start: 12, end: 17 }], // Monday
  2: [{ start: 12, end: 17 }], // Tuesday
  3: [{ start: 12, end: 17 }], // Wednesday
  4: [{ start: 12, end: 17 }], // Thursday
  5: [{ start: 12, end: 17 }], // Friday
};

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return client;
}

function getCalendar() {
  return google.calendar({ version: "v3", auth: getOAuth2Client() });
}

// Generate all possible 30-min slots for a given date based on open windows
function generateSlots(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  const dayOfWeek = getDayOfWeekInTimezone(dateStr);
  const windows = OPEN_WINDOWS[dayOfWeek];

  if (!windows) return []; // Weekend or no windows

  const slots = [];
  for (const window of windows) {
    let hour = window.start;
    let min = 0;
    while (hour < window.end || (hour === window.end && min === 0)) {
      if (hour === window.end && min === 0) break;
      const startTime = `${dateStr}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
      const endMin = min + SLOT_DURATION_MIN;
      const endHour = hour + Math.floor(endMin / 60);
      const endMinRemainder = endMin % 60;
      if (endHour > window.end || (endHour === window.end && endMinRemainder > 0 && endHour >= window.end)) {
        if (endHour > window.end) break;
      }
      const endTime = `${dateStr}T${String(endHour).padStart(2, "0")}:${String(endMinRemainder).padStart(2, "0")}:00`;

      slots.push({ start: startTime, end: endTime });

      min += SLOT_DURATION_MIN;
      if (min >= 60) {
        hour += Math.floor(min / 60);
        min = min % 60;
      }
    }
  }
  return slots;
}

// Get day of week in LA timezone (0=Sun, 1=Mon, ...)
function getDayOfWeekInTimezone(dateStr) {
  const d = new Date(dateStr + "T12:00:00-07:00"); // approximate PT
  // Use Intl to get the actual weekday
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
  });
  const dayName = formatter.format(d);
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return dayMap[dayName];
}

// Fetch busy times from Google Calendar for a date range
async function getBusyTimes(dateStr) {
  const cal = getCalendar();
  const timeMin = `${dateStr}T00:00:00-08:00`;
  const timeMax = `${dateStr}T23:59:59-08:00`;

  const res = await cal.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: TIMEZONE,
      items: [{ id: process.env.GOOGLE_CALENDAR_ID || "primary" }],
    },
  });

  const busy =
    res.data.calendars[process.env.GOOGLE_CALENDAR_ID || "primary"]?.busy || [];
  return busy.map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));
}

// Check if a slot overlaps with any busy period
function isSlotFree(slot, busyTimes) {
  const slotStart = new Date(slot.start);
  const slotEnd = new Date(slot.end);

  for (const busy of busyTimes) {
    if (slotStart < busy.end && slotEnd > busy.start) {
      return false;
    }
  }
  return true;
}

// Get available slots for a date
async function getAvailableSlots(dateStr) {
  const allSlots = generateSlots(dateStr);
  if (allSlots.length === 0) return [];

  const busyTimes = await getBusyTimes(dateStr);

  return allSlots.filter((slot) => isSlotFree(slot, busyTimes));
}

// Create a booking on the calendar
async function createBooking({ slotStart, name, email, phone, purpose }) {
  const cal = getCalendar();

  const startDt = new Date(slotStart);
  const endDt = new Date(startDt.getTime() + SLOT_DURATION_MIN * 60 * 1000);

  const event = await cal.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    requestBody: {
      summary: `Paid Booking: ${name}`,
      description: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nPurpose: ${purpose}\n\nPaid via x402 ($1 USDC)`,
      start: {
        dateTime: startDt.toISOString(),
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: endDt.toISOString(),
        timeZone: TIMEZONE,
      },
      attendees: [{ email }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 30 },
          { method: "popup", minutes: 10 },
        ],
      },
    },
    sendUpdates: "all",
  });

  return event.data;
}

module.exports = { getAvailableSlots, createBooking, TIMEZONE };
