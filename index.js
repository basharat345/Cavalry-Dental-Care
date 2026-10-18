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
const { adminRouter, initializeDatabaseIndexes, getActiveClinicSettings } = require('./admin');

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
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
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
    environment: process.env.NODE_ENV || 'production',
    serverTime: new Date().toISOString(),
    timeZone: TIMEZONE
  });
});

// Dynamic public clinic info loaded from settings in MongoDB
app.get('/api/clinic-info', async (req, res) => {
  try {
    const config = await getActiveClinicSettings(req.db);
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Unable to retrieve clinic info' });
  }
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

    const currentConfig = await getActiveClinicSettings(req.db);

    // Find taken slots (both confirmed and pending appointments lock the slot)
    const activeAppointments = await req.db.collection('appointments').find({
      dentistId: dentistId,
      appointmentDate: date,
      status: { $in: ['pending', 'confirmed'] }
    }).project({ timeSlot: 1 }).toArray();

    const bookedSlots = new Set(activeAppointments.map(a => a.timeSlot));

    // Filter available slots based on dynamic clinic slot settings
    const availableSlots = (currentConfig.slots || []).map(slot => ({
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
      return res.status(400).json({ success: false, message: 'You must consent to the booking policy.' });
    }

    if (!patientName || patientName.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Please provide a valid patient name.' });
    }

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

    const currentConfig = await getActiveClinicSettings(req.db);
    if (!currentConfig.slots.includes(timeSlot)) {
      return res.status(400).json({ success: false, message: 'Selected time slot is outside standard clinic hours.' });
    }

    // Atomic Slot Check & Insertion
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
      appointmentDate,
      timeSlot,
      patientType: patientType === 'returning' ? 'returning' : 'new',
      notes: notes ? notes.trim().slice(0, 500) : '',
      status: 'pending',
      adminNotes: '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await req.db.collection('appointments').insertOne(newAppointment);

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
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

  <style>
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

      --clay-card: 16px 16px 32px #d5e0f5, -16px -16px 32px #ffffff;
      --clay-btn: 8px 8px 18px #cbd9f3, -8px -8px 18px #ffffff;
      --clay-btn-active: inset 4px 4px 8px rgba(0,0,0,0.1), inset -4px -4px 8px rgba(255,255,255,0.7);
      --clay-input: inset 4px 4px 8px #dce5f7, inset -4px -4px 8px #ffffff;
      
      --radius-sm: 16px;
      --radius-md: 24px;
      --radius-lg: 32px;
      --radius-pill: 9999px;
      --transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }

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

    .container { width: 100%; max-width: 1240px; margin: 0 auto; padding: 0 24px; }

    .clay-card {
      background: var(--card-bg);
      border-radius: var(--radius-lg);
      box-shadow: var(--clay-card);
      border: 2px solid rgba(255, 255, 255, 0.8);
      transition: var(--transition);
      position: relative;
    }
    .clay-card:hover { transform: translateY(-5px); box-shadow: 20px 20px 38px #ccd8f0, -20px -20px 38px #ffffff; }

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
      display: inline-flex; align-items: center; justify-content: center;
      gap: 10px; padding: 14px 28px; border-radius: var(--radius-pill);
      font-weight: 700; font-size: 1rem; text-decoration: none;
      cursor: pointer; border: none; outline: none; transition: var(--transition);
      box-shadow: var(--clay-btn);
    }
    .clay-btn-primary {
      background: var(--primary); color: #ffffff;
      box-shadow: 6px 6px 16px rgba(79, 140, 255, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.4);
    }
    .clay-btn-primary:hover { background: var(--primary-hover); transform: translateY(-3px) scale(1.02); }
    .clay-btn-primary:active { transform: translateY(1px); box-shadow: var(--clay-btn-active); }
    .clay-btn-secondary { background: #FFFFFF; color: var(--text); }
    .clay-btn-secondary:hover { background: var(--sky); color: var(--primary); transform: translateY(-3px); }

    .navbar { position: sticky; top: 16px; z-index: 1000; padding: 12px 0; margin-bottom: 24px; }
    .navbar-inner {
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(255, 255, 255, 0.88); backdrop-filter: blur(14px);
      border-radius: var(--radius-pill); padding: 10px 24px;
      box-shadow: 8px 8px 24px #d6e2f8, -8px -8px 24px #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.9);
    }
    .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--text); }
    .brand-icon {
      width: 44px; height: 44px; border-radius: 50%;
      background: linear-gradient(135deg, var(--primary), #7aaaff);
      color: #FFFFFF; display: flex; align-items: center; justify-content: center;
      font-size: 1.3rem; box-shadow: 4px 4px 10px rgba(79, 140, 255, 0.3);
    }
    .brand-text h1 { font-size: 1.25rem; font-weight: 800; color: var(--text); letter-spacing: -0.5px; line-height: 1.1; }
    .brand-text span { font-size: 0.72rem; color: var(--primary); font-weight: 700; text-transform: uppercase; }

    .nav-links { display: flex; align-items: center; gap: 20px; list-style: none; }
    .nav-link { text-decoration: none; color: var(--text-muted); font-weight: 600; font-size: 0.92rem; padding: 8px 12px; border-radius: var(--radius-pill); transition: var(--transition); }
    .nav-link:hover { color: var(--primary); background: var(--sky); }
    .nav-actions { display: flex; align-items: center; gap: 12px; }
    .nav-admin-link { text-decoration: none; color: var(--text-muted); font-size: 0.85rem; padding: 8px 14px; border-radius: var(--radius-pill); background: #f0f4fd; transition: var(--transition); }
    .nav-admin-link:hover { background: var(--lavender); color: #4a3d8a; }
    .hamburger-btn { display: none; background: none; border: none; font-size: 1.5rem; color: var(--text); cursor: pointer; }

    .hero-section { padding: 40px 0 60px; }
    .hero-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 40px; align-items: center; }
    .hero-content h2 { font-family: 'Poppins', sans-serif; font-size: 3.4rem; font-weight: 800; line-height: 1.15; color: var(--text); margin-bottom: 20px; }
    .hero-content h2 span { color: var(--primary); position: relative; }
    .hero-desc { font-size: 1.15rem; color: var(--text-muted); margin-bottom: 32px; max-width: 540px; }
    .hero-btns { display: flex; gap: 16px; flex-wrap: wrap; }
    .hero-visual-wrapper { position: relative; }
    .hero-img-box { border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--clay-card); border: 4px solid #ffffff; background: #ffffff; }
    .hero-img { width: 100%; height: 440px; object-fit: cover; display: block; }

    .float-clay {
      position: absolute; background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(8px); padding: 12px 20px; border-radius: var(--radius-md);
      box-shadow: 10px 10px 24px #cbd7ed, -10px -10px 24px #ffffff;
      display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 0.9rem;
      border: 2px solid #ffffff; animation: floatMotion 5s ease-in-out infinite alternate;
    }
    .float-card-1 { top: -20px; left: -20px; animation-delay: 0s; }
    .float-card-2 { bottom: -20px; right: -10px; animation-delay: 2s; }
    @keyframes floatMotion { 0% { transform: translateY(0px) rotate(0deg); } 100% { transform: translateY(-12px) rotate(1deg); } }

    .info-strip { margin-bottom: 70px; }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
    .info-card { padding: 24px; display: flex; align-items: flex-start; gap: 16px; }
    .info-icon { width: 50px; height: 50px; border-radius: 18px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; }

    .section-head { text-align: center; max-width: 680px; margin: 0 auto 50px; }
    .section-head h3 { font-family: 'Poppins', sans-serif; font-size: 2.3rem; font-weight: 800; color: var(--text); margin-top: 10px; margin-bottom: 12px; }
    .section-head p { color: var(--text-muted); font-size: 1.05rem; }

    .services-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 28px; margin-bottom: 80px; }
    .service-card { padding: 30px; display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-lg); }
    .srv-icon-box { width: 58px; height: 58px; border-radius: 20px; background: var(--sky); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 20px; box-shadow: inset 2px 2px 5px rgba(255,255,255,0.8), 4px 4px 10px rgba(79, 140, 255, 0.15); }
    .srv-name { font-size: 1.25rem; font-weight: 700; margin-bottom: 10px; color: var(--text); }
    .srv-desc { color: var(--text-muted); font-size: 0.92rem; line-height: 1.5; margin-bottom: 24px; flex-grow: 1; }
    .srv-footer { display: flex; align-items: center; justify-content: space-between; border-top: 2px dashed #e7effc; padding-top: 18px; }
    .srv-price { font-size: 1.15rem; font-weight: 800; color: var(--text); }
    .srv-price small { display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); }

    .dentists-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 32px; margin-bottom: 80px; }
    .dentist-card { padding: 24px; border-radius: var(--radius-lg); text-align: center; }
    .dentist-img { width: 140px; height: 140px; border-radius: 50%; object-fit: cover; margin: 0 auto 18px; display: block; border: 4px solid #ffffff; box-shadow: 6px 6px 16px #cbd9f0, -6px -6px 16px #ffffff; }
    .dentist-name { font-size: 1.35rem; font-weight: 800; margin-bottom: 4px; }
    .dentist-spec { color: var(--primary); font-weight: 700; font-size: 0.95rem; margin-bottom: 12px; }
    .dentist-bio { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 20px; line-height: 1.5; }

    .booking-section { padding: 60px 0; margin-bottom: 80px; }
    .booking-wrapper { max-width: 900px; margin: 0 auto; padding: 44px; background: #FFFFFF; border-radius: var(--radius-lg); box-shadow: var(--clay-card); border: 3px solid #ffffff; }
    .booking-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
    .form-group { display: flex; flex-direction: column; gap: 8px; }
    .form-group.full-width { grid-column: 1 / -1; }
    .form-label { font-size: 0.88rem; font-weight: 700; color: var(--text); }

    .clay-input, .clay-select, .clay-textarea {
      width: 100%; padding: 14px 18px; border-radius: var(--radius-sm); border: 1.5px solid transparent;
      background: #F4F7FF; color: var(--text); font-family: inherit; font-size: 0.95rem;
      box-shadow: var(--clay-input); outline: none; transition: var(--transition);
    }
    .clay-input:focus, .clay-select:focus, .clay-textarea:focus { background: #FFFFFF; border-color: var(--primary); box-shadow: 0 0 0 4px rgba(79, 140, 255, 0.15); }

    .slots-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; margin-top: 6px; }
    .slot-pill {
      padding: 10px 8px; text-align: center; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 700;
      cursor: pointer; background: #FFFFFF; box-shadow: 4px 4px 10px #e0e9f8, -4px -4px 10px #ffffff;
      border: 2px solid transparent; transition: var(--transition); user-select: none;
    }
    .slot-pill.selected { background: var(--primary); color: #FFFFFF; border-color: var(--primary); box-shadow: inset 2px 2px 5px rgba(0,0,0,0.2); }
    .slot-pill.disabled { background: #edf1fa; color: #aab5cb; cursor: not-allowed; box-shadow: none; text-decoration: line-through; }

    .toast-container { position: fixed; top: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
    .toast {
      pointer-events: auto; padding: 16px 24px; border-radius: var(--radius-md); background: #FFFFFF;
      box-shadow: 10px 10px 28px #cad6ec, -10px -10px 28px #ffffff; display: flex; align-items: center; gap: 14px;
      font-weight: 700; font-size: 0.95rem; border-left: 6px solid var(--primary); transform: translateX(120%);
      transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); max-width: 420px;
    }
    .toast.show { transform: translateX(0); }
    .toast.success { border-color: var(--success); }
    .toast.error { border-color: var(--error); }

    .footer { background: #FFFFFF; border-top: 2px solid #e7effc; padding: 60px 0 30px; margin-top: 60px; }
    .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr; gap: 40px; margin-bottom: 50px; }
    .footer-col h4 { font-size: 1.15rem; font-weight: 800; margin-bottom: 20px; color: var(--text); }
    .footer-links { list-style: none; display: flex; flex-direction: column; gap: 12px; }
    .footer-links a { color: var(--text-muted); text-decoration: none; font-weight: 600; font-size: 0.92rem; transition: var(--transition); }
    .footer-links a:hover { color: var(--primary); padding-left: 4px; }
    .footer-bottom { border-top: 1px solid #edf2fc; padding-top: 25px; display: flex; align-items: center; justify-content: space-between; color: var(--text-muted); font-size: 0.88rem; }

    .clay-modal-backdrop {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(37, 50, 74, 0.4); backdrop-filter: blur(6px); z-index: 10000;
      display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; padding: 20px;
    }
    .clay-modal-backdrop.active { opacity: 1; pointer-events: auto; }
    .clay-modal { background: #FFFFFF; border-radius: var(--radius-lg); max-width: 500px; width: 100%; padding: 36px; box-shadow: var(--clay-card); text-align: center; transform: scale(0.9); transition: var(--transition); }
    .clay-modal-backdrop.active .clay-modal { transform: scale(1); }

    @media (max-width: 992px) {
      .hero-grid { grid-template-columns: 1fr; text-align: center; }
      .hero-desc { margin: 0 auto 30px; }
      .hero-btns { justify-content: center; }
      .booking-form-grid { grid-template-columns: 1fr; }
      .footer-grid { grid-template-columns: 1fr 1fr; }
    }

    @media (max-width: 768px) {
      .hero-content h2 { font-size: 2.4rem; }
      .nav-links { display: none; }
      .hamburger-btn { display: block; }
      .booking-wrapper { padding: 24px; }
      .footer-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

  <div class="toast-container" id="toastContainer"></div>

  <!-- Booking Confirmation Modal -->
  <div class="clay-modal-backdrop" id="confirmationModal">
    <div class="clay-modal">
      <div style="width: 72px; height: 72px; border-radius: 50%; background: var(--mint); color: #1e7046; font-size: 2rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; box-shadow: 4px 4px 12px #d4ecdc;">
        <i class="fa-solid fa-check"></i>
      </div>
      <h3 style="font-size: 1.6rem; font-weight: 800; margin-bottom: 8px;">Booking Confirmed!</h3>
      <p style="color: var(--text-muted); margin-bottom: 18px;">Your appointment has been registered with Cavalry Dental Care.</p>
      
      <div style="background: var(--sky); padding: 18px; border-radius: var(--radius-sm); margin-bottom: 24px;">
        <span style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: var(--primary); font-weight: 800;">Booking Reference Code</span>
        <div id="modalRefCode" style="font-size: 1.6rem; font-weight: 800; color: var(--text); letter-spacing: 1.5px; margin-top: 4px;">CDC-XXXXX</div>
      </div>

      <div style="text-align: left; font-size: 0.9rem; color: var(--text-muted); margin-bottom: 24px; background: #fafcff; padding: 14px; border-radius: var(--radius-sm);">
        <p><strong>Dentist:</strong> <span id="modalDentist">-</span></p>
        <p><strong>Service:</strong> <span id="modalService">-</span></p>
        <p><strong>Date & Time:</strong> <span id="modalDateTime">-</span></p>
      </div>

      <button class="clay-btn clay-btn-primary" style="width: 100%;" onclick="closeConfirmationModal()">Done</button>
    </div>
  </div>

  <!-- Navbar -->
  <header class="navbar">
    <div class="container">
      <div class="navbar-inner">
        <a href="/" class="brand">
          <div class="brand-icon"><i class="fa-solid fa-tooth"></i></div>
          <div class="brand-text">
            <h1 id="dynNavbarTitle">Cavalry Dental</h1>
            <span>Care & Implant Center</span>
          </div>
        </a>

        <ul class="nav-links" id="navLinks">
          <li><a href="#services" class="nav-link">Services</a></li>
          <li><a href="#dentists" class="nav-link">Our Dentists</a></li>
          <li><a href="#why-us" class="nav-link">Why Choose Us</a></li>
          <li><a href="#about" class="nav-link">About</a></li>
          <li><a href="#contact" class="nav-link">Contact</a></li>
        </ul>

        <div class="nav-actions">
          <a href="#booking" class="clay-btn clay-btn-primary" style="padding: 10px 20px; font-size: 0.88rem;">
            <i class="fa-solid fa-calendar-check"></i> Book Now
          </a>
          <a href="/admin/login" class="nav-admin-link" title="Clinic Staff Login">
            <i class="fa-solid fa-lock"></i> Staff
          </a>
          <button class="hamburger-btn" onclick="toggleMobileNav()" aria-label="Toggle menu">
            <i class="fa-solid fa-bars"></i>
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="hero-section">
    <div class="container">
      <div class="hero-grid">
        <div class="hero-content">
          <span class="clay-pill mint" style="margin-bottom: 16px;">
            <i class="fa-solid fa-heart-pulse"></i> Certified Gentle Dental Care in Lahore
          </span>
          <h2>Your Smile Deserves <span>Exceptional Care</span></h2>
          <p class="hero-desc" id="dynHeroDesc">
            Comfortable dental care, friendly professionals, and convenient appointments — all in one place at Cavalry Ground, Lahore.
          </p>
          <div class="hero-btns">
            <a href="#booking" class="clay-btn clay-btn-primary">
              <i class="fa-solid fa-calendar-plus"></i> Book Your Appointment
            </a>
            <a href="#services" class="clay-btn clay-btn-secondary">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Explore Our Services
            </a>
          </div>
        </div>

        <div class="hero-visual-wrapper">
          <div class="hero-img-box">
            <img src="https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=800" 
                 alt="Cavalry Dental Care modern clinic room" 
                 class="hero-img"
                 onerror="this.src='https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=800'">
          </div>

          <div class="float-clay float-card-1">
            <div style="background: var(--sky); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--primary);">
              <i class="fa-solid fa-user-doctor"></i>
            </div>
            <div>
              <div style="color: var(--text);">Gentle Dental Care</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">Painless techniques</div>
            </div>
          </div>

          <div class="float-clay float-card-2">
            <div style="background: var(--mint); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #1e7046;">
              <i class="fa-solid fa-bolt"></i>
            </div>
            <div>
              <div style="color: var(--text);">Instant Booking</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">Real-time slot lock</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Clinic Information Strip -->
  <section class="info-strip">
    <div class="container">
      <div class="info-grid">
        <div class="clay-card info-card">
          <div class="info-icon" style="background: var(--sky); color: var(--primary);">
            <i class="fa-solid fa-clock"></i>
          </div>
          <div>
            <h4 style="font-size: 1rem; font-weight: 800;">Clinic Hours</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted);" id="dynStripHours">Mon – Sat: 9:00 AM – 8:00 PM<br>Sunday: Closed</p>
          </div>
        </div>

        <div class="clay-card info-card">
          <div class="info-icon" style="background: var(--mint); color: #1e7046;">
            <i class="fa-solid fa-location-dot"></i>
          </div>
          <div>
            <h4 style="font-size: 1rem; font-weight: 800;">Location</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted);" id="dynStripLocation">Cavalry Ground, Lahore, Pakistan</p>
          </div>
        </div>

        <div class="clay-card info-card">
          <div class="info-icon" style="background: var(--lavender); color: #5a4ca1;">
            <i class="fa-solid fa-phone"></i>
          </div>
          <div>
            <h4 style="font-size: 1rem; font-weight: 800;">Front Desk</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted);" id="dynStripPhone">+92 300 1234567<br>WhatsApp Available</p>
          </div>
        </div>

        <div class="clay-card info-card">
          <div class="info-icon" style="background: var(--sunshine); color: #8f6c00;">
            <i class="fa-solid fa-calendar-check"></i>
          </div>
          <div>
            <h4 style="font-size: 1rem; font-weight: 800;">Appointments</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted);">Online scheduling available 24/7 with zero waiting queue</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Dental Services -->
  <section id="services" class="container" style="padding-bottom: 40px;">
    <div class="section-head">
      <span class="clay-pill blue"><i class="fa-solid fa-tooth"></i> Specialized Treatments</span>
      <h3>Our Dental Services</h3>
      <p>Delivering comprehensive preventative, corrective, and aesthetic oral healthcare using cutting-edge dental technology.</p>
    </div>
    <div class="services-grid" id="servicesGrid"></div>
  </section>

  <!-- Dentist Profiles -->
  <section id="dentists" class="container" style="padding-bottom: 40px;">
    <div class="section-head">
      <span class="clay-pill lavender"><i class="fa-solid fa-user-doctor"></i> Dedicated Professionals</span>
      <h3>Meet Our Dental Specialists</h3>
      <p>Our experienced dental practitioners are committed to gentle, personalized treatment and patient comfort.</p>
    </div>
    <div class="dentists-grid" id="dentistsGrid"></div>
  </section>

  <!-- Why Choose Us -->
  <section id="why-us" class="container" style="padding-bottom: 70px;">
    <div class="section-head">
      <span class="clay-pill mint"><i class="fa-solid fa-circle-check"></i> Exceptional Standards</span>
      <h3>Why Patients Trust Cavalry Dental</h3>
      <p>We blend compassionate dental care with clinical precision in a calm, contemporary setting.</p>
    </div>

    <div class="info-grid">
      <div class="clay-card" style="padding: 30px;">
        <div style="font-size: 2rem; color: var(--primary); margin-bottom: 12px;"><i class="fa-solid fa-calendar-days"></i></div>
        <h4 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px;">Easy Online Booking</h4>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Select your preferred dentist, date, and live available slot in less than 60 seconds.</p>
      </div>

      <div class="clay-card" style="padding: 30px;">
        <div style="font-size: 2rem; color: var(--success); margin-bottom: 12px;"><i class="fa-solid fa-face-smile"></i></div>
        <h4 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px;">Gentle & Painless</h4>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Modern numbing techniques and calming operatories make dental visits completely anxiety-free.</p>
      </div>

      <div class="clay-card" style="padding: 30px;">
        <div style="font-size: 2rem; color: #8e62d4; margin-bottom: 12px;"><i class="fa-solid fa-layer-group"></i></div>
        <h4 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px;">Full-Scope Clinic</h4>
        <p style="color: var(--text-muted); font-size: 0.9rem;">From routine scaling to root canals, braces, and implants, all under one roof in Cavalry Ground.</p>
      </div>

      <div class="clay-card" style="padding: 30px;">
        <div style="font-size: 2rem; color: var(--coral); margin-bottom: 12px;"><i class="fa-solid fa-headset"></i></div>
        <h4 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px;">Attentive Support</h4>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Receive prompt booking confirmations and personalized reminders straight to your WhatsApp.</p>
      </div>
    </div>
  </section>

  <!-- Interactive Appointment Booking Form -->
  <section id="booking" class="booking-section">
    <div class="container">
      <div class="section-head">
        <span class="clay-pill sunshine"><i class="fa-solid fa-calendar-check"></i> Book Online</span>
        <h3>Schedule Your Consultation</h3>
        <p>Pick your practitioner and lock in your appointment time. We look forward to welcoming you!</p>
      </div>

      <div class="booking-wrapper">
        <form id="appointmentForm" onsubmit="handleBookingSubmit(event)">
          <div class="booking-form-grid">
            
            <div class="form-group">
              <label class="form-label" for="patientName"><i class="fa-solid fa-user"></i> Full Name *</label>
              <input type="text" id="patientName" class="clay-input" placeholder="e.g. Bilal Shah" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="patientPhone"><i class="fa-solid fa-phone"></i> Mobile Number (Pakistan) *</label>
              <input type="tel" id="patientPhone" class="clay-input" placeholder="0300 1234567 or +92 300 1234567" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="patientEmail"><i class="fa-solid fa-envelope"></i> Email Address (Optional)</label>
              <input type="email" id="patientEmail" class="clay-input" placeholder="name@example.com">
            </div>

            <div class="form-group">
              <label class="form-label" for="patientType"><i class="fa-solid fa-id-badge"></i> Patient Status</label>
              <select id="patientType" class="clay-select">
                <option value="new">First-time Patient at Cavalry Dental</option>
                <option value="returning">Returning Registered Patient</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="serviceSelect"><i class="fa-solid fa-tooth"></i> Select Dental Service *</label>
              <select id="serviceSelect" class="clay-select" required>
                <option value="">-- Choose a service --</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="dentistSelect"><i class="fa-solid fa-user-doctor"></i> Preferred Dentist *</label>
              <select id="dentistSelect" class="clay-select" required onchange="fetchAvailableSlots()">
                <option value="">-- Choose a dentist --</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="appointmentDate"><i class="fa-solid fa-calendar"></i> Appointment Date *</label>
              <input type="date" id="appointmentDate" class="clay-input" required onchange="fetchAvailableSlots()">
            </div>

            <div class="form-group full-width">
              <label class="form-label"><i class="fa-solid fa-clock"></i> Select Time Slot (Asia/Karachi) *</label>
              <div id="slotsContainer" class="slots-container">
                <div style="grid-column: 1 / -1; padding: 12px; color: var(--text-muted); font-size: 0.88rem;">
                  Please select a dentist and date to view live available slots.
                </div>
              </div>
              <input type="hidden" id="selectedTimeSlot" required>
            </div>

            <div class="form-group full-width">
              <label class="form-label" for="patientNotes"><i class="fa-solid fa-notes-medical"></i> Dental Concerns or Questions (Optional)</label>
              <textarea id="patientNotes" class="clay-textarea" rows="3" placeholder="Tell us about tooth pain, previous treatments, or dental sensitivity..."></textarea>
            </div>

            <div class="form-group full-width" style="display: flex; flex-direction: row; align-items: flex-start; gap: 10px;">
              <input type="checkbox" id="consentCheckbox" required style="margin-top: 4px; width: 18px; height: 18px; accent-color: var(--primary);">
              <label for="consentCheckbox" style="font-size: 0.85rem; color: var(--text-muted);">
                I confirm the information provided is accurate and consent to Cavalry Dental Care storing my booking details to schedule and remind me of my clinic visit.
              </label>
            </div>

            <div class="form-group full-width" style="margin-top: 10px;">
              <button type="submit" id="submitBookingBtn" class="clay-btn clay-btn-primary" style="width: 100%; padding: 18px;">
                <i class="fa-solid fa-shield-heart"></i> Complete Online Reservation
              </button>
            </div>

          </div>
        </form>
      </div>
    </div>
  </section>

  <!-- About & Contact Section -->
  <section id="about" class="container" style="padding-bottom: 70px;">
    <div class="hero-grid" style="align-items: stretch;">
      <div class="clay-card" style="padding: 40px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <span class="clay-pill coral" style="margin-bottom: 16px;"><i class="fa-solid fa-map-pin"></i> Cavalry Ground, Lahore</span>
          <h3 style="font-size: 2.1rem; font-weight: 800; margin-bottom: 16px;">Modern Clinical Excellence</h3>
          <p style="color: var(--text-muted); margin-bottom: 16px;">
            Located in the central heart of Cavalry Ground, Lahore, Cavalry Dental Care brings together seasoned dental professionals, hygienic sterilization protocols, and a calming clinical ambiance.
          </p>
          <p style="color: var(--text-muted); margin-bottom: 24px;">
            Whether you require emergency pain relief, regular preventative scaling, or advanced smile enhancement, we ensure every treatment is explained clearly with transparent pricing.
          </p>
        </div>

        <div style="display: flex; gap: 14px; flex-wrap: wrap;">
          <a id="dynWhatsappBtn" href="https://wa.me/923001234567?text=Hi%20Cavalry%20Dental%20Care,%20I%20would%20like%20to%20inquire%20about%20an%20appointment" 
             target="_blank" rel="noopener noreferrer" 
             class="clay-btn" style="background: #25D366; color: white; box-shadow: 4px 4px 12px rgba(37,211,102,0.3);">
            <i class="fa-brands fa-whatsapp"></i> Chat on WhatsApp
          </a>
          <a href="https://www.google.com/maps/search/Cavalry+Ground+Lahore" 
             target="_blank" rel="noopener noreferrer" 
             class="clay-btn clay-btn-secondary">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open in Google Maps
          </a>
        </div>
      </div>

      <div id="contact" class="clay-card" style="padding: 40px;">
        <h3 style="font-size: 1.6rem; font-weight: 800; margin-bottom: 8px;">Leave a Message</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 24px;">Have questions regarding pricing, braces, or specialized treatment?</p>
        
        <form onsubmit="handleContactSubmit(event)">
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div>
              <input type="text" id="contactName" class="clay-input" placeholder="Your Name" required>
            </div>
            <div>
              <input type="tel" id="contactPhone" class="clay-input" placeholder="Phone Number (e.g. 0300 1234567)" required>
            </div>
            <div>
              <input type="text" id="contactSubject" class="clay-input" placeholder="Subject / Procedure">
            </div>
            <div>
              <textarea id="contactMessage" class="clay-textarea" rows="3" placeholder="How can our clinical team help you?" required></textarea>
            </div>
            <button type="submit" id="contactBtn" class="clay-btn clay-btn-primary" style="width: 100%;">
              <i class="fa-solid fa-paper-plane"></i> Send Message
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-col">
          <div class="brand" style="margin-bottom: 16px;">
            <div class="brand-icon"><i class="fa-solid fa-tooth"></i></div>
            <div class="brand-text">
              <h1 id="dynFooterTitle">Cavalry Dental</h1>
              <span>Care & Implant Center</span>
            </div>
          </div>
          <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 340px; margin-bottom: 20px;">
            A premier, gentle dental wellness and restorative clinic in Cavalry Ground, Lahore. Committed to bright, healthy smiles for patients of all ages.
          </p>
          <div style="display: flex; gap: 12px;">
            <span class="clay-pill mint"><i class="fa-solid fa-shield"></i> Sterilized Standards</span>
          </div>
        </div>

        <div class="footer-col">
          <h4>Navigation</h4>
          <ul class="footer-links">
            <li><a href="#services">Our Dental Services</a></li>
            <li><a href="#dentists">Meet the Dentists</a></li>
            <li><a href="#why-us">Why Choose Us</a></li>
            <li><a href="#booking">Book Appointment</a></li>
            <li><a href="/admin/login">Clinic Staff Portal</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Services</h4>
          <ul class="footer-links">
            <li><a href="#booking">Teeth Cleaning & Scaling</a></li>
            <li><a href="#booking">Teeth Whitening</a></li>
            <li><a href="#booking">Root Canal Therapy</a></li>
            <li><a href="#booking">Orthodontic Braces</a></li>
            <li><a href="#booking">Cosmetic Veneers</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Visit the Clinic</h4>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 12px;" id="dynFooterLocation">
            <i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> Cavalry Ground, Commercial Plaza, Lahore, Pakistan
          </p>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 12px;" id="dynFooterPhone">
            <i class="fa-solid fa-phone" style="color: var(--primary);"></i> +92 300 1234567
          </p>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 18px;" id="dynFooterHours">
            <i class="fa-solid fa-clock" style="color: var(--primary);"></i> Mon – Sat: 9:00 AM – 8:00 PM
          </p>
          <a href="#booking" class="clay-btn clay-btn-primary" style="padding: 10px 18px; font-size: 0.85rem;">
            Instant Online Slot Booking
          </a>
        </div>
      </div>

      <div class="footer-bottom">
        <div>&copy; <span id="currentYear"></span> <span id="dynCopyrightName">Cavalry Dental Care</span>. All rights reserved. Demonstration Clinic System.</div>
        <div>Compliant with Asia/Karachi Clinical Scheduling</div>
      </div>
    </div>
  </footer>

  <script>
    let globalServices = [];
    let globalDentists = [];

    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('currentYear').textContent = new Date().getFullYear();
      
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const minDate = \`\${year}-\${month}-\${day}\`;
      
      const dateInput = document.getElementById('appointmentDate');
      dateInput.min = minDate;
      dateInput.value = minDate;

      loadClinicData();
    });

    function showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = \`toast \${type}\`;
      
      const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-triangle-exclamation' : 'fa-bell');
      toast.innerHTML = \`<i class="fa-solid \${icon}"></i> <span>\${message}</span>\`;
      
      container.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 50);
      
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
      }, 4000);
    }

    function toggleMobileNav() {
      const links = document.getElementById('navLinks');
      if (links.style.display === 'flex') {
        links.style.display = 'none';
      } else {
        links.style.display = 'flex';
        links.style.flexDirection = 'column';
        links.style.position = 'absolute';
        links.style.top = '70px';
        links.style.left = '16px';
        links.style.right = '16px';
        links.style.background = '#FFFFFF';
        links.style.padding = '20px';
        links.style.borderRadius = '24px';
        links.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
      }
    }

    async function loadClinicData() {
      try {
        const [servicesRes, dentistsRes, infoRes] = await Promise.all([
          fetch('/api/services'),
          fetch('/api/dentists'),
          fetch('/api/clinic-info')
        ]);

        const sData = await servicesRes.json();
        const dData = await dentistsRes.json();
        const iData = await infoRes.json();

        if (iData.success && iData.data) {
          applyClinicSettings(iData.data);
        }

        if (sData.success) {
          globalServices = sData.data;
          renderServices(globalServices);
          populateServiceDropdown(globalServices);
        }

        if (dData.success) {
          globalDentists = dData.data;
          renderDentists(globalDentists);
          populateDentistDropdown(globalDentists);
        }

        fetchAvailableSlots();
      } catch (err) {
        console.error('Failed loading initial clinic data:', err);
      }
    }

    function applyClinicSettings(cfg) {
      if (!cfg) return;
      if (cfg.name) {
        document.getElementById('dynNavbarTitle').textContent = cfg.name;
        document.getElementById('dynFooterTitle').textContent = cfg.name;
        document.getElementById('dynCopyrightName').textContent = cfg.name;
      }
      if (cfg.location) {
        document.getElementById('dynStripLocation').textContent = cfg.location;
        document.getElementById('dynFooterLocation').innerHTML = \`<i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> \${cfg.location}\`;
      }
      if (cfg.phone) {
        document.getElementById('dynStripPhone').innerHTML = \`\${cfg.phone}<br>WhatsApp Available\`;
        document.getElementById('dynFooterPhone').innerHTML = \`<i class="fa-solid fa-phone" style="color: var(--primary);"></i> \${cfg.phone}\`;
      }
      if (cfg.hours) {
        document.getElementById('dynStripHours').innerHTML = \`\${cfg.workingDays || 'Mon – Sat'}: \${cfg.hours}<br>Sunday: Closed\`;
        document.getElementById('dynFooterHours').innerHTML = \`<i class="fa-solid fa-clock" style="color: var(--primary);"></i> \${cfg.workingDays || 'Mon – Sat'}: \${cfg.hours}\`;
      }
      if (cfg.whatsapp) {
        document.getElementById('dynWhatsappBtn').href = \`https://wa.me/\${cfg.whatsapp}?text=Hi%20\${encodeURIComponent(cfg.name || 'Clinic')},%20I%20would%20like%20to%20inquire%20about%20an%20appointment\`;
      }
    }

    function renderServices(services) {
      const container = document.getElementById('servicesGrid');
      container.innerHTML = services.map(s => \`
        <div class="clay-card service-card">
          <div>
            <div class="srv-icon-box">
              <i class="fa-solid \${s.icon || 'fa-tooth'}"></i>
            </div>
            <h4 class="srv-name">\${s.name}</h4>
            <p class="srv-desc">\${s.desc}</p>
          </div>
          <div class="srv-footer">
            <div class="srv-price">
              <small>Starting from</small>
              PKR \${Number(s.pricePKR).toLocaleString()}
            </div>
            <button onclick="preselectService('\${s.id}')" class="clay-btn clay-btn-primary" style="padding: 8px 16px; font-size: 0.85rem;">
              Book Service
            </button>
          </div>
        </div>
      \`).join('');
    }

    function renderDentists(dentists) {
      const container = document.getElementById('dentistsGrid');
      container.innerHTML = dentists.map(d => \`
        <div class="clay-card dentist-card">
          <img src="\${d.photo}" alt="\${d.name}" class="dentist-img" onerror="this.src='https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400'">
          <h4 class="dentist-name">\${d.name}</h4>
          <div class="dentist-spec">\${d.specialty}</div>
          <p class="dentist-bio">\${d.bio}</p>
          <button onclick="preselectDentist('\${d.id}')" class="clay-btn clay-btn-secondary" style="width: 100%;">
            <i class="fa-solid fa-calendar-plus"></i> Book with \${d.name.split(' ')[1] || 'Doctor'}
          </button>
        </div>
      \`).join('');
    }

    function populateServiceDropdown(services) {
      const select = document.getElementById('serviceSelect');
      services.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = \`\${s.name} — PKR \${Number(s.pricePKR).toLocaleString()}\`;
        select.appendChild(opt);
      });
    }

    function populateDentistDropdown(dentists) {
      const select = document.getElementById('dentistSelect');
      dentists.forEach((d, index) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = \`\${d.name} (\${d.specialty})\`;
        if (index === 0) opt.selected = true;
        select.appendChild(opt);
      });
    }

    function preselectService(serviceId) {
      const select = document.getElementById('serviceSelect');
      select.value = serviceId;
      document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
    }

    function preselectDentist(dentistId) {
      const select = document.getElementById('dentistSelect');
      select.value = dentistId;
      document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
      fetchAvailableSlots();
    }

    async function fetchAvailableSlots() {
      const dentistId = document.getElementById('dentistSelect').value;
      const date = document.getElementById('appointmentDate').value;
      const container = document.getElementById('slotsContainer');
      const hiddenInput = document.getElementById('selectedTimeSlot');
      
      hiddenInput.value = '';

      if (!dentistId || !date) {
        container.innerHTML = '<div style="grid-column: 1 / -1; color: var(--text-muted); font-size: 0.88rem;">Select dentist and date first.</div>';
        return;
      }

      container.innerHTML = '<div style="grid-column: 1 / -1; color: var(--text-muted); font-size: 0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Checking slot availability...</div>';

      try {
        const res = await fetch(\`/api/availability?dentistId=\${encodeURIComponent(dentistId)}&date=\${encodeURIComponent(date)}\`);
        const result = await res.json();

        if (result.success && result.slots) {
          container.innerHTML = '';
          let hasAvailable = false;

          result.slots.forEach(s => {
            const pill = document.createElement('div');
            pill.className = \`slot-pill \${s.available ? '' : 'disabled'}\`;
            pill.textContent = s.time;
            
            if (s.available) {
              hasAvailable = true;
              pill.onclick = () => {
                document.querySelectorAll('.slot-pill').forEach(el => el.classList.remove('selected'));
                pill.classList.add('selected');
                hiddenInput.value = s.time;
              };
            }
            container.appendChild(pill);
          });

          if (!hasAvailable) {
            container.innerHTML = '<div style="grid-column: 1 / -1; color: var(--error); font-size: 0.9rem; font-weight: 700;">No available slots on this date. Please pick another date.</div>';
          }
        } else {
          container.innerHTML = \`<div style="grid-column: 1 / -1; color: var(--error); font-size: 0.88rem;">\${result.message || 'Could not fetch slots.'}</div>\`;
        }
      } catch (err) {
        container.innerHTML = '<div style="grid-column: 1 / -1; color: var(--error); font-size: 0.88rem;">Error connecting to clinic server.</div>';
      }
    }

    async function handleBookingSubmit(e) {
      e.preventDefault();
      const btn = document.getElementById('submitBookingBtn');
      const slot = document.getElementById('selectedTimeSlot').value;

      if (!slot) {
        showToast('Please tap on an available time slot above!', 'error');
        return;
      }

      const dentistSelect = document.getElementById('dentistSelect');
      const serviceSelect = document.getElementById('serviceSelect');

      const payload = {
        patientName: document.getElementById('patientName').value,
        patientPhone: document.getElementById('patientPhone').value,
        patientEmail: document.getElementById('patientEmail').value,
        patientType: document.getElementById('patientType').value,
        serviceId: serviceSelect.value,
        serviceName: serviceSelect.options[serviceSelect.selectedIndex].text.split(' — ')[0],
        dentistId: dentistSelect.value,
        dentistName: dentistSelect.options[dentistSelect.selectedIndex].text.split(' (')[0],
        appointmentDate: document.getElementById('appointmentDate').value,
        timeSlot: slot,
        notes: document.getElementById('patientNotes').value,
        consent: document.getElementById('consentCheckbox').checked
      };

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Securing Your Slot...';

      try {
        const response = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
          showToast('Appointment successfully scheduled!', 'success');
          
          document.getElementById('modalRefCode').textContent = data.data.bookingReference;
          document.getElementById('modalDentist').textContent = data.data.dentistName;
          document.getElementById('modalService').textContent = data.data.serviceName;
          document.getElementById('modalDateTime').textContent = \`\${data.data.appointmentDate} at \${data.data.timeSlot}\`;
          document.getElementById('confirmationModal').classList.add('active');

          document.getElementById('appointmentForm').reset();
          document.getElementById('selectedTimeSlot').value = '';
          fetchAvailableSlots();
        } else {
          showToast(data.message || 'Slot reservation failed.', 'error');
          fetchAvailableSlots();
        }
      } catch (err) {
        showToast('Network error submitting your booking. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-shield-heart"></i> Complete Online Reservation';
      }
    }

    function closeConfirmationModal() {
      document.getElementById('confirmationModal').classList.remove('active');
    }

    async function handleContactSubmit(e) {
      e.preventDefault();
      const btn = document.getElementById('contactBtn');
      const payload = {
        name: document.getElementById('contactName').value,
        phone: document.getElementById('contactPhone').value,
        subject: document.getElementById('contactSubject').value,
        message: document.getElementById('contactMessage').value
      };

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          e.target.reset();
        } else {
          showToast(data.message || 'Could not send message.', 'error');
        }
      } catch (err) {
        showToast('Failed to reach server. Please try WhatsApp.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Message';
      }
    }
  </script>
</body>
</html>`);
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[Cavalry Dental Care] Server live on http://localhost:${PORT}`);
  });
}

module.exports = app;
