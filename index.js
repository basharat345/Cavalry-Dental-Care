/**
 * Cavalry Dental Care — Public Application & Core Server
 * Architecture: Node.js 24.x, Express, MongoDB Atlas, Serverless-ready for Vercel
 * Design System: Colorful Claymorphism with Tactile Pastel Aesthetics
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

// Import Admin Router and shared subroutines from admin.js
const { adminRouter, initializeDatabaseIndexes } = require('./admin');

const app = express();

// ==========================================
// 1. CONFIGURATION & DATABASE CONNECTION
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'cavalry_dental_db';
const PORT = process.env.PORT || 3000;
const TIMEZONE = 'Asia/Karachi';

// Global cache for MongoDB connection across serverless invocations
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  await client.connect();
  const db = client.db(MONGODB_DB);

  cachedClient = client;
  cachedDb = db;

  // Initialize unique indexes and default seeding safely once
  await initializeDatabaseIndexes(db);

  return { client: cachedClient, db: cachedDb };
}

// Attach DB to request object
app.use(async (req, res, next) => {
  try {
    const { db } = await connectToDatabase();
    req.db = db;
    next();
  } catch (err) {
    console.error('Database connection error:', err.message);
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable. Please verify MONGODB_URI in Vercel environment variables.'
      });
    }
    // Render an aesthetic error state on public views if DB is down
    res.status(503).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"><title>Service Notice — Cavalry Dental Care</title>
        <style>
          body { font-family: 'Plus Jakarta Sans', sans-serif; background: #F4F7FF; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; color: #25324A; }
          .clay-box { background: #FFFFFF; padding: 40px; border-radius: 28px; box-shadow: 12px 12px 24px #d6e0f5, -12px -12px 24px #ffffff; text-align: center; max-width: 480px; }
          h2 { color: #4F8CFF; }
        </style>
      </head>
      <body>
        <div class="clay-box">
          <h2>Cavalry Dental Care</h2>
          <p>The clinic booking database is currently connecting or initializing. Please refresh in a few moments.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// ==========================================
// 2. MIDDLEWARE & SECURITY HEADERS
// ==========================================
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Custom lightweight security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Rate limiters for public endpoints
const publicBookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many booking attempts. Please wait 15 minutes before trying again.' }
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many messages sent. Please wait 15 minutes.' }
});

// ==========================================
// 3. CLINIC SEED DEFINITIONS & CONSTANTS
// ==========================================
const CLINIC_CONFIG = {
  name: "Cavalry Dental Care",
  tagline: "Your Smile Deserves Exceptional Care",
  location: "Cavalry Ground, Lahore, Pakistan",
  phone: "+92 300 1234567",
  whatsapp: "923001234567",
  email: "appointments@example.com",
  workingDays: "Monday – Saturday",
  hours: "9:00 AM – 8:00 PM",
  slotDurationMinutes: 45,
  slots: [
    "09:00 AM", "09:45 AM", "10:30 AM", "11:15 AM", "12:00 PM",
    "02:00 PM", "02:45 PM", "03:30 PM", "04:15 PM", "05:00 PM",
    "05:45 PM", "06:30 PM", "07:15 PM"
  ]
};

const DEFAULT_SERVICES = [
  { id: "srv-1", name: "General Dental Checkup", pricePKR: 2000, duration: "30 mins", icon: "fa-stethoscope", desc: "Comprehensive oral inspection, digital X-rays evaluation, and periodontal gum screening." },
  { id: "srv-2", name: "Teeth Cleaning & Scaling", pricePKR: 3500, duration: "45 mins", icon: "fa-tooth", desc: "Ultrasonic tartar removal, stain polishing, and deep subgingival prophylaxis." },
  { id: "srv-3", name: "Teeth Whitening", pricePKR: 5000, duration: "60 mins", icon: "fa-wand-magic-sparkles", desc: "Advanced laser-accelerated dental bleaching restoring up to 6 radiant shades." },
  { id: "srv-4", name: "Root Canal Treatment", pricePKR: 12000, duration: "60 mins", icon: "fa-shield-halved", desc: "Painless computerized rotary endodontics preserving infected natural teeth." },
  { id: "srv-5", name: "Dental Composite Fillings", pricePKR: 3000, duration: "45 mins", icon: "fa-gem", desc: "Color-matched bio-compatible micro-hybrid resin restorations for seamless strength." },
  { id: "srv-6", name: "Braces & Orthodontics", pricePKR: 65000, duration: "45 mins", icon: "fa-arrows-split-up-and-left", desc: "Precision ceramic brackets, traditional metal braces, and invisible clear aligners." },
  { id: "srv-7", name: "Titanium Dental Implants", pricePKR: 45000, duration: "90 mins", icon: "fa-screwdriver-wrench", desc: "Permanent Osseo-integrated surgical titanium posts with custom zirconia crowns." },
  { id: "srv-8", name: "Painless Tooth Extraction", pricePKR: 2500, duration: "40 mins", icon: "fa-hand-holding-medical", desc: "Gentle atraumatic surgical and non-surgical wisdom and molar extractions." },
  { id: "srv-9", name: "Pediatric Dentistry", pricePKR: 2500, duration: "30 mins", icon: "fa-child-reaching", desc: "Friendly cavity prevention, fluoride varnishes, and gentle care designed for kids." },
  { id: "srv-10", name: "Cosmetic Smile Design", pricePKR: 25000, duration: "60 mins", icon: "fa-face-smile-beam", desc: "Handcrafted porcelain veneers, gum recontouring, and custom full smile makeovers." }
];

const DEFAULT_DENTISTS = [
  {
    id: "dent-1",
    name: "Dr. Ayesha Khan",
    specialty: "General Dental Surgeon",
    bio: "Passionate about preventive care, diagnostic dentistry, and painless restorative procedures.",
    experience: "8+ Years Experience (Demo)",
    photo: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400"
  },
  {
    id: "dent-2",
    name: "Dr. Hamza Malik",
    specialty: "Aesthetic & Cosmetic Dentist",
    bio: "Specializing in ceramic veneers, laser teeth whitening, and complete cosmetic smile transformations.",
    experience: "10+ Years Experience (Demo)",
    photo: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=400"
  },
  {
    id: "dent-3",
    name: "Dr. Sara Ahmed",
    specialty: "Orthodontist & Dentofacial Orthopedist",
    bio: "Expert in modern clear aligners, adolescent braces, and corrective bite alignment therapy.",
    experience: "7+ Years Experience (Demo)",
    photo: "https://images.unsplash.com/photo-1594824813570-588383a54b39?auto=format&fit=crop&q=80&w=400"
  }
];

// Helper: safe date formatting in Asia/Karachi
function getKarachiDateString(dateObj = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
  return parts; // Returns YYYY-MM-DD
}

// Generate unique human-readable booking reference
function generateBookingReference() {
  const prefix = "CDC";
  const randomChars = crypto.randomBytes(3).toString('hex').toUpperCase();
  const dateSegment = new Date().toISOString().slice(2, 7).replace('-', '');
  return `${prefix}-${dateSegment}-${randomChars}`;
}

// ==========================================
// 4. PUBLIC API ENDPOINTS
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    clinic: CLINIC_CONFIG.name,
    environment: process.env.NODE_ENV || 'production',
    serverTime: new Date().toISOString(),
    timeZone: TIMEZONE
  });
});

// Get clinic info
app.get('/api/clinic-info', (req, res) => {
  res.json({ success: true, data: CLINIC_CONFIG });
});

// Get active dental services
app.get('/api/services', async (req, res) => {
  try {
    const services = await req.db.collection('services').find({ active: { $ne: false } }).toArray();
    res.json({ success: true, data: services.length > 0 ? services : DEFAULT_SERVICES });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Unable to retrieve services' });
  }
});

// Get active dentist profiles
app.get('/api/dentists', async (req, res) => {
  try {
    const dentists = await req.db.collection('dentists').find({ active: { $ne: false } }).toArray();
    res.json({ success: true, data: dentists.length > 0 ? dentists : DEFAULT_DENTISTS });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Unable to retrieve dentists' });
  }
});

// Check available time slots for a dentist & date
app.get('/api/availability', async (req, res) => {
  try {
    const { dentistId, date } = req.query;

    if (!dentistId || !date) {
      return res.status(400).json({ success: false, message: 'Dentist and valid date are required.' });
    }

    const todayStr = getKarachiDateString();
    if (date < todayStr) {
      return res.status(400).json({ success: false, message: 'Past dates cannot be booked.' });
    }

    // Find taken slots (both confirmed and pending appointments lock the slot)
    const activeAppointments = await req.db.collection('appointments').find({
      dentistId: dentistId,
      appointmentDate: date,
      status: { $in: ['pending', 'confirmed'] }
    }).project({ timeSlot: 1 }).toArray();

    const bookedSlots = new Set(activeAppointments.map(a => a.timeSlot));

    // Filter available slots
    const availableSlots = CLINIC_CONFIG.slots.map(slot => ({
      time: slot,
      available: !bookedSlots.has(slot)
    }));

    res.json({
      success: true,
      date,
      dentistId,
      timeZone: TIMEZONE,
      slots: availableSlots
    });
  } catch (err) {
    console.error('Availability check failed:', err);
    res.status(500).json({ success: false, message: 'Could not fetch time slots.' });
  }
});

// Create new appointment (Atomic slot reservation pattern)
app.post('/api/appointments', publicBookingLimiter, async (req, res) => {
  try {
    const {
      patientName,
      patientPhone,
      patientEmail,
      serviceId,
      serviceName,
      dentistId,
      dentistName,
      appointmentDate,
      timeSlot,
      patientType,
      notes,
      consent
    } = req.body;

    // Server-side validations
    if (!consent) {
      return res.status(400).json({ success: false, message: 'You must consent to the privacy policy.' });
    }

    if (!patientName || patientName.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Please provide a valid patient name.' });
    }

    // Validate phone number format (support Pakistan local + international prefixes)
    const phoneClean = (patientPhone || '').replace(/[\s\-\(\)]/g, '');
    const phoneRegex = /^((\+92)|(0092)|(92)|0)?3[0-9]{9}$/;
    if (!phoneRegex.test(phoneClean)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid Pakistani mobile number (e.g. 0300 1234567 or +92 300 1234567).' });
    }

    if (patientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    if (!dentistId || !appointmentDate || !timeSlot) {
      return res.status(400).json({ success: false, message: 'Dentist, appointment date, and time slot are required.' });
    }

    const todayStr = getKarachiDateString();
    if (appointmentDate < todayStr) {
      return res.status(400).json({ success: false, message: 'Past dates cannot be scheduled.' });
    }

    if (!CLINIC_CONFIG.slots.includes(timeSlot)) {
      return res.status(400).json({ success: false, message: 'Selected time slot is outside standard clinic hours.' });
    }

    // Atomic Slot Check & Insertion
    // We enforce non-concurrency by checking if a non-cancelled booking exists for this dentist, date, and slot
    const existingConflict = await req.db.collection('appointments').findOne({
      dentistId,
      appointmentDate,
      timeSlot,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (existingConflict) {
      return res.status(409).json({
        success: false,
        message: 'This time slot was just claimed by another patient. Please select an alternate time.'
      });
    }

    const bookingReference = generateBookingReference();

    const newAppointment = {
      bookingReference,
      patientName: patientName.trim(),
      patientPhone: phoneClean,
      patientEmail: patientEmail ? patientEmail.trim().toLowerCase() : '',
      serviceId: serviceId || 'srv-1',
      serviceName: serviceName || 'General Dental Checkup',
      dentistId,
      dentistName: dentistName || 'Dr. Ayesha Khan',
      appointmentDate, // Stored as ISO YYYY-MM-DD
      timeSlot,
      patientType: patientType === 'returning' ? 'returning' : 'new',
      notes: notes ? notes.trim().slice(0, 500) : '',
      status: 'pending', // pending, confirmed, completed, cancelled
      adminNotes: '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await req.db.collection('appointments').insertOne(newAppointment);

    res.status(201).json({
      success: true,
      message: 'Appointment successfully scheduled! Our receptionist will confirm via call/WhatsApp.',
      data: {
        bookingReference: newAppointment.bookingReference,
        patientName: newAppointment.patientName,
        appointmentDate: newAppointment.appointmentDate,
        timeSlot: newAppointment.timeSlot,
        dentistName: newAppointment.dentistName,
        serviceName: newAppointment.serviceName,
        status: newAppointment.status
      }
    });

  } catch (err) {
    console.error('Booking submission error:', err);
    // Duplicate key safeguard if a unique index catches an ultra-tight race condition
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This specific time slot was simultaneously reserved. Please choose another slot.'
      });
    }
    res.status(500).json({ success: false, message: 'Server error processing booking. Please try again.' });
  }
});

// Limited Privacy-safe Booking Status Lookup
app.get('/api/appointments/:reference', async (req, res) => {
  try {
    const reference = req.params.reference.toUpperCase().trim();
    const booking = await req.db.collection('appointments').findOne(
      { bookingReference: reference },
      {
        projection: {
          bookingReference: 1,
          dentistName: 1,
          serviceName: 1,
          appointmentDate: 1,
          timeSlot: 1,
          status: 1,
          createdAt: 1
        }
      }
    );

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking reference not found.' });
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Unable to query booking details.' });
  }
});

// Contact message submission
app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, phone, email, subject, message } = req.body;

    if (!name || !phone || !message) {
      return res.status(400).json({ success: false, message: 'Name, phone number, and message are required.' });
    }

    const contactEntry = {
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : '',
      subject: subject ? subject.trim() : 'General Inquiry',
      message: message.trim().slice(0, 1000),
      read: false,
      handled: false,
      createdAt: new Date()
    };

    await req.db.collection('contacts').insertOne(contactEntry);

    res.json({ success: true, message: 'Your message has been received! Our front desk will contact you soon.' });
  } catch (err) {
    console.error('Contact submit error:', err);
    res.status(500).json({ success: false, message: 'Could not send message. Please contact us via phone.' });
  }
});

// ==========================================
// 5. MOUNT ADMIN ROUTER
// ==========================================
app.use(adminRouter);

// ==========================================
// 6. PUBLIC FRONTEND HTML, CLAY CSS & CLIENT JS
// ==========================================
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cavalry Dental Care — Modern Gentle Dentistry in Lahore</title>
  <meta name="description" content="Experience high-quality, friendly, and pain-free dental care at Cavalry Ground, Lahore. Book appointments online in seconds.">
  
  <!-- Google Fonts: Plus Jakarta Sans & Poppins -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
  
  <!-- Font Awesome Icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

  <style>
    /* ==========================================================
       CLAYMORPHISM DESIGN SYSTEM - CAVALRY DENTAL CARE
       ========================================================== */
    :root {
      --primary: #4F8CFF;
      --primary-hover: #3d79ed;
      --sky: #DDEEFF;
      --mint: #B8F2D0;
      --lavender: #DCD3FF;
      --coral: #FFB6A6;
      --sunshine: #FFE79A;
      --bg: #F4F7FF;
      --card-bg: #FFFFFF;
      --text: #25324A;
      --text-muted: #68758A;
      --success: #36B879;
      --error: #E85D75;

      /* Clay Box Shadows & Inset Highlights */
      --clay-card: 16px 16px 32px #d5e0f5, -16px -16px 32px #ffffff;
      --clay-card-inset: inset 4px 4px 8px rgba(255,255,255,0.8), inset -4px -4px 8px rgba(79, 140, 255, 0.08);
      --clay-btn: 8px 8px 18px #cbd9f3, -8px -8px 18px #ffffff;
      --clay-btn-active: inset 4px 4px 8px rgba(0,0,0,0.1), inset -4px -4px 8px rgba(255,255,255,0.7);
      --clay-input: inset 4px 4px 8px #dce5f7, inset -4px -4px 8px #ffffff;
      
      --radius-sm: 16px;
      --radius-md: 24px;
      --radius-lg: 32px;
      --radius-pill: 9999px;
      
      --transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      overflow-x: hidden;
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(221, 238, 255, 0.6) 0%, transparent 40%),
        radial-gradient(circle at 90% 70%, rgba(220, 211, 255, 0.4) 0%, transparent 45%),
        radial-gradient(circle at 50% 90%, rgba(184, 242, 208, 0.35) 0%, transparent 40%);
      background-attachment: fixed;
    }

    /* Container */
    .container {
      width: 100%;
      max-width: 1240px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Clay Base Utilities */
    .clay-card {
      background: var(--card-bg);
      border-radius: var(--radius-lg);
      box-shadow: var(--clay-card);
      border: 2px solid rgba(255, 255, 255, 0.8);
      transition: var(--transition);
      position: relative;
    }

    .clay-card:hover {
      transform: translateY(-5px);
      box-shadow: 20px 20px 38px #ccd8f0, -20px -20px 38px #ffffff;
    }

    .clay-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 20px;
      border-radius: var(--radius-pill);
      font-size: 0.875rem;
      font-weight: 700;
      box-shadow: inset 2px 2px 5px rgba(255,255,255,0.9), 4px 4px 10px rgba(79, 140, 255, 0.12);
    }

    .clay-pill.blue { background: var(--sky); color: var(--primary); }
    .clay-pill.mint { background: var(--mint); color: #1e7046; }
    .clay-pill.lavender { background: var(--lavender); color: #5a4ca1; }
    .clay-pill.sunshine { background: var(--sunshine); color: #8f6c00; }
    .clay-pill.coral { background: var(--coral); color: #9c2e17; }

    .clay-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 28px;
      border-radius: var(--radius-pill);
