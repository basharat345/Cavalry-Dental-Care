/**
 * Cavalry Dental Care — Administrative Subsystem & Management Router
 * Architecture: Mounted Express Router with Claymorphism SPA Dashboard,
 * secure JWT-in-HTTP-Only cookie authentication, rate limiting, and CRUD APIs.
 * Includes interactive, enterable Clinic Settings stored in MongoDB and Vercel Config Reference.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const rateLimit = require('express-rate-limit');

const adminRouter = express.Router();

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'cavalry-super-secure-secret-key-lahore-2026';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@cavalrydental.pk').toLowerCase().trim();
const DEFAULT_PASSWORD_HASH = '$2a$10$U9Hk221Kszr3.q5Q1qLcA.lYxP8fV65M6Wk2e38MsmzQvX3B/b1C6'; // 'Admin@Cavalry2026!'
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || DEFAULT_PASSWORD_HASH;

// Default Clinic Settings Baseline
const DEFAULT_CLINIC_SETTINGS = {
  key: "clinic_settings",
  name: "Cavalry Dental Care",
  tagline: "Your Smile Deserves Exceptional Care",
  location: "Cavalry Ground, Lahore, Pakistan",
  phone: "+92 300 1234567",
  whatsapp: "923001234567",
  email: "appointments@example.com",
  workingDays: "Monday – Saturday",
  hours: "9:00 AM – 8:00 PM",
  slotDurationMinutes: 45,
  bookingNotice: "Appointments must be confirmed at least 2 hours prior to arrival.",
  slots: [
    "09:00 AM", "09:45 AM", "10:30 AM", "11:15 AM", "12:00 PM",
    "02:00 PM", "02:45 PM", "03:30 PM", "04:15 PM", "05:00 PM",
    "05:45 PM", "06:30 PM", "07:15 PM"
  ]
};

// Helper to fetch merged active settings from MongoDB or defaults
async function getActiveClinicSettings(db) {
  try {
    const settingsDoc = await db.collection('settings').findOne({ key: "clinic_settings" });
    if (settingsDoc) {
      return { ...DEFAULT_CLINIC_SETTINGS, ...settingsDoc };
    }
  } catch (err) {
    console.error("Error reading clinic settings from DB:", err.message);
  }
  return DEFAULT_CLINIC_SETTINGS;
}

// ==========================================
// 1. DATABASE INDEX & SEED INITIALIZER
// ==========================================
async function initializeDatabaseIndexes(db) {
  try {
    await db.collection('appointments').createIndex(
      { dentistId: 1, appointmentDate: 1, timeSlot: 1 },
      { 
        unique: true, 
        partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } }
      }
    );

    await db.collection('appointments').createIndex({ bookingReference: 1 }, { unique: true });
    await db.collection('appointments').createIndex({ appointmentDate: 1, status: 1 });
    await db.collection('settings').createIndex({ key: 1 }, { unique: true });

    // Seed default settings if empty
    const settingsCount = await db.collection('settings').countDocuments({ key: "clinic_settings" });
    if (settingsCount === 0) {
      await db.collection('settings').insertOne({ ...DEFAULT_CLINIC_SETTINGS, createdAt: new Date() });
    }

    // Seed services if empty
    const servicesCount = await db.collection('services').countDocuments();
    if (servicesCount === 0) {
      const defaultServices = [
        { id: "srv-1", name: "General Dental Checkup", pricePKR: 2000, duration: "30 mins", icon: "fa-stethoscope", desc: "Comprehensive oral inspection, digital X-rays evaluation, and periodontal gum screening.", active: true },
        { id: "srv-2", name: "Teeth Cleaning & Scaling", pricePKR: 3500, duration: "45 mins", icon: "fa-tooth", desc: "Ultrasonic tartar removal, stain polishing, and deep subgingival prophylaxis.", active: true },
        { id: "srv-3", name: "Teeth Whitening", pricePKR: 5000, duration: "60 mins", icon: "fa-wand-magic-sparkles", desc: "Advanced laser-accelerated dental bleaching restoring up to 6 radiant shades.", active: true },
        { id: "srv-4", name: "Root Canal Treatment", pricePKR: 12000, duration: "60 mins", icon: "fa-shield-halved", desc: "Painless computerized rotary endodontics preserving infected natural teeth.", active: true },
        { id: "srv-5", name: "Dental Composite Fillings", pricePKR: 3000, duration: "45 mins", icon: "fa-gem", desc: "Color-matched bio-compatible micro-hybrid resin restorations for seamless strength.", active: true },
        { id: "srv-6", name: "Braces & Orthodontics", pricePKR: 65000, duration: "45 mins", icon: "fa-arrows-split-up-and-left", desc: "Precision ceramic brackets, traditional metal braces, and invisible clear aligners.", active: true },
        { id: "srv-7", name: "Titanium Dental Implants", pricePKR: 45000, duration: "90 mins", icon: "fa-screwdriver-wrench", desc: "Permanent Osseo-integrated surgical titanium posts with custom zirconia crowns.", active: true },
        { id: "srv-8", name: "Painless Tooth Extraction", pricePKR: 2500, duration: "40 mins", icon: "fa-hand-holding-medical", desc: "Gentle atraumatic surgical and non-surgical wisdom and molar extractions.", active: true },
        { id: "srv-9", name: "Pediatric Dentistry", pricePKR: 2500, duration: "30 mins", icon: "fa-child-reaching", desc: "Friendly cavity prevention, fluoride varnishes, and gentle care designed for kids.", active: true },
        { id: "srv-10", name: "Cosmetic Smile Design", pricePKR: 25000, duration: "60 mins", icon: "fa-face-smile-beam", desc: "Handcrafted porcelain veneers, gum recontouring, and custom full smile makeovers.", active: true }
      ];
      await db.collection('services').insertMany(defaultServices);
    }

    // Seed dentists if empty
    const dentistsCount = await db.collection('dentists').countDocuments();
    if (dentistsCount === 0) {
      const defaultDentists = [
        {
          id: "dent-1",
          name: "Dr. Ayesha Khan",
          specialty: "General Dental Surgeon",
          bio: "Passionate about preventive care, diagnostic dentistry, and painless restorative procedures.",
          experience: "8+ Years Experience (Demo)",
          photo: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400",
          active: true
        },
        {
          id: "dent-2",
          name: "Dr. Hamza Malik",
          specialty: "Aesthetic & Cosmetic Dentist",
          bio: "Specializing in ceramic veneers, laser teeth whitening, and complete cosmetic smile transformations.",
          experience: "10+ Years Experience (Demo)",
          photo: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=400",
          active: true
        },
        {
          id: "dent-3",
          name: "Dr. Sara Ahmed",
          specialty: "Orthodontist & Dentofacial Orthopedist",
          bio: "Expert in modern clear aligners, adolescent braces, and corrective bite alignment therapy.",
          experience: "7+ Years Experience (Demo)",
          photo: "https://images.unsplash.com/photo-1594824813570-588383a54b39?auto=format&fit=crop&q=80&w=400",
          active: true
        }
      ];
      await db.collection('dentists').insertMany(defaultDentists);
    }

  } catch (err) {
    console.error('Error during index initialization:', err.message);
  }
}

// ==========================================
// 2. AUTHENTICATION & ACCESS CONTROL
// ==========================================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes before re-trying.' }
});

function verifyAdminAuth(req, res, next) {
  const token = req.cookies.cavalry_admin_token;
  if (!token) {
    if (req.path.startsWith('/api/admin/')) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    return res.redirect('/admin/login');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminUser = decoded;
    next();
  } catch (err) {
    res.clearCookie('cavalry_admin_token');
    if (req.path.startsWith('/api/admin/')) {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    return res.redirect('/admin/login');
  }
}

// ==========================================
// 3. ADMIN AUTHENTICATION APIS
// ==========================================
adminRouter.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    if (email.toLowerCase().trim() !== ADMIN_EMAIL) {
      return res.status(401).json({ success: false, message: 'Invalid administrative credentials.' });
    }

    // Check if an updated admin password hash is stored in MongoDB, else fallback to environment variable
    const authDoc = await req.db.collection('settings').findOne({ key: "admin_auth" });
    const targetHash = authDoc?.passwordHash || ADMIN_PASSWORD_HASH;

    const passwordMatches = await bcrypt.compare(password, targetHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid administrative credentials.' });
    }

    const token = jwt.sign(
      { email: ADMIN_EMAIL, role: 'administrator' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.cookie('cavalry_admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    });

    res.json({ success: true, message: 'Welcome back, Administrator!' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Internal authentication server error.' });
  }
});

adminRouter.post('/api/admin/logout', (req, res) => {
  res.clearCookie('cavalry_admin_token');
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ==========================================
// 4. ENTERABLE SETTINGS & PASSWORD CHANGE APIS
// ==========================================

// Get current enterable settings
adminRouter.get('/api/admin/settings', verifyAdminAuth, async (req, res) => {
  try {
    const settings = await getActiveClinicSettings(req.db);
    res.json({ success: true, data: settings, adminEmail: ADMIN_EMAIL });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load clinic settings.' });
  }
});

// Save updated enterable settings
adminRouter.post('/api/admin/settings', verifyAdminAuth, async (req, res) => {
  try {
    const {
      name,
      location,
      phone,
      whatsapp,
      email,
      workingDays,
      hours,
      slotDurationMinutes,
      bookingNotice,
      slotsInput
    } = req.body;

    if (!name || !phone || !location) {
      return res.status(400).json({ success: false, message: 'Clinic name, address, and phone are required.' });
    }

    // Parse slots if provided as comma-separated or newline-separated string
    let parsedSlots = DEFAULT_CLINIC_SETTINGS.slots;
    if (slotsInput && typeof slotsInput === 'string') {
      parsedSlots = slotsInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    } else if (Array.isArray(slotsInput) && slotsInput.length > 0) {
      parsedSlots = slotsInput;
    }

    const cleanWhatsapp = (whatsapp || phone || '').replace(/[^0-9]/g, '');

    const updatedSettings = {
      key: "clinic_settings",
      name: name.trim(),
      location: location.trim(),
      phone: phone.trim(),
      whatsapp: cleanWhatsapp,
      email: email ? email.trim() : DEFAULT_CLINIC_SETTINGS.email,
      workingDays: workingDays ? workingDays.trim() : DEFAULT_CLINIC_SETTINGS.workingDays,
      hours: hours ? hours.trim() : DEFAULT_CLINIC_SETTINGS.hours,
      slotDurationMinutes: Number(slotDurationMinutes) || 45,
      bookingNotice: bookingNotice ? bookingNotice.trim() : '',
      slots: parsedSlots,
      updatedAt: new Date()
    };

    await req.db.collection('settings').updateOne(
      { key: "clinic_settings" },
      { $set: updatedSettings },
      { upsert: true }
    );

    res.json({ success: true, message: 'Clinic settings updated successfully!', data: updatedSettings });
  } catch (err) {
    console.error('Error saving settings:', err);
    res.status(500).json({ success: false, message: 'Failed to save settings.' });
  }
});

// Change Admin Password API
adminRouter.post('/api/admin/settings/password', verifyAdminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    // Verify current password
    const authDoc = await req.db.collection('settings').findOne({ key: "admin_auth" });
    const targetHash = authDoc?.passwordHash || ADMIN_PASSWORD_HASH;

    const matches = await bcrypt.compare(currentPassword, targetHash);
    if (!matches) {
      return res.status(401).json({ success: false, message: 'Current password does not match.' });
    }

    // Hash new password and persist in database
    const newHash = await bcrypt.hash(newPassword, 10);
    await req.db.collection('settings').updateOne(
      { key: "admin_auth" },
      { $set: { key: "admin_auth", passwordHash: newHash, updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true, message: 'Admin password successfully updated! Please remember your new password.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update administrator password.' });
  }
});

// ==========================================
// 5. ADMIN DASHBOARD STATS & CRUD APIS
// ==========================================
adminRouter.get('/api/admin/stats', verifyAdminAuth, async (req, res) => {
  try {
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const [
      totalAppointments,
      todayAppointments,
      pendingCount,
      confirmedCount,
      completedCount,
      cancelledCount,
      totalContacts
    ] = await Promise.all([
      req.db.collection('appointments').countDocuments(),
      req.db.collection('appointments').countDocuments({ appointmentDate: todayStr }),
      req.db.collection('appointments').countDocuments({ status: 'pending' }),
      req.db.collection('appointments').countDocuments({ status: 'confirmed' }),
      req.db.collection('appointments').countDocuments({ status: 'completed' }),
      req.db.collection('appointments').countDocuments({ status: 'cancelled' }),
      req.db.collection('contacts').countDocuments()
    ]);

    res.json({
      success: true,
      stats: {
        totalAppointments,
        todayAppointments,
        pendingCount,
        confirmedCount,
        completedCount,
        cancelledCount,
        totalContacts
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to compute dashboard analytics.' });
  }
});

adminRouter.get('/api/admin/appointments', verifyAdminAuth, async (req, res) => {
  try {
    const { search, status, date, dentistId } = req.query;
    const query = {};

    if (status && status !== 'all') query.status = status;
    if (date) query.appointmentDate = date;
    if (dentistId && dentistId !== 'all') query.dentistId = dentistId;

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { patientName: searchRegex },
        { bookingReference: searchRegex },
        { patientPhone: searchRegex }
      ];
    }

    const appointments = await req.db.collection('appointments')
      .find(query)
      .sort({ appointmentDate: -1, timeSlot: 1 })
      .limit(200)
      .toArray();

    res.json({ success: true, data: appointments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not fetch appointments.' });
  }
});

adminRouter.patch('/api/admin/appointments/:id', verifyAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, appointmentDate, timeSlot } = req.body;

    const updateDoc = {
      $set: { updatedAt: new Date() }
    };

    if (status) updateDoc.$set.status = status;
    if (adminNotes !== undefined) updateDoc.$set.adminNotes = adminNotes;
    if (appointmentDate) updateDoc.$set.appointmentDate = appointmentDate;
    if (timeSlot) updateDoc.$set.timeSlot = timeSlot;

    if (appointmentDate || timeSlot) {
      const existing = await req.db.collection('appointments').findOne({ _id: new ObjectId(id) });
      if (existing) {
        const targetDentist = existing.dentistId;
        const targetDate = appointmentDate || existing.appointmentDate;
        const targetSlot = timeSlot || existing.timeSlot;

        const conflict = await req.db.collection('appointments').findOne({
          _id: { $ne: new ObjectId(id) },
          dentistId: targetDentist,
          appointmentDate: targetDate,
          timeSlot: targetSlot,
          status: { $in: ['pending', 'confirmed'] }
        });

        if (conflict) {
          return res.status(409).json({ success: false, message: 'The chosen reschedule slot is already occupied.' });
        }
      }
    }

    const result = await req.db.collection('appointments').updateOne(
      { _id: new ObjectId(id) },
      updateDoc
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    res.json({ success: true, message: 'Appointment updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update appointment record.' });
  }
});

adminRouter.get('/api/admin/appointments/export/csv', verifyAdminAuth, async (req, res) => {
  try {
    const appointments = await req.db.collection('appointments')
      .find({})
      .sort({ appointmentDate: -1 })
      .toArray();

    let csv = "Booking Reference,Patient Name,Phone,Email,Service,Dentist,Date,Time,Status,Created At\n";
    
    appointments.forEach(a => {
      const row = [
        `"${a.bookingReference || ''}"`,
        `"${(a.patientName || '').replace(/"/g, '""')}"`,
        `"${a.patientPhone || ''}"`,
        `"${a.patientEmail || ''}"`,
        `"${a.serviceName || ''}"`,
        `"${a.dentistName || ''}"`,
        `"${a.appointmentDate || ''}"`,
        `"${a.timeSlot || ''}"`,
        `"${a.status || ''}"`,
        `"${new Date(a.createdAt).toISOString()}"`
      ];
      csv += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=cavalry_appointments_${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).send('Error generating CSV export.');
  }
});

adminRouter.post('/api/admin/services', verifyAdminAuth, async (req, res) => {
  try {
    const { name, pricePKR, duration, desc, icon } = req.body;
    if (!name || !pricePKR) {
      return res.status(400).json({ success: false, message: 'Name and price in PKR are required.' });
    }

    const newService = {
      id: "srv-" + Date.now(),
      name: name.trim(),
      pricePKR: Number(pricePKR),
      duration: duration || '45 mins',
      desc: desc || '',
      icon: icon || 'fa-tooth',
      active: true,
      createdAt: new Date()
    };

    await req.db.collection('services').insertOne(newService);
    res.json({ success: true, message: 'Service added successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add service.' });
  }
});

adminRouter.post('/api/admin/dentists', verifyAdminAuth, async (req, res) => {
  try {
    const { name, specialty, bio, photo } = req.body;
    if (!name || !specialty) {
      return res.status(400).json({ success: false, message: 'Name and specialty are required.' });
    }

    const newDentist = {
      id: "dent-" + Date.now(),
      name: name.trim(),
      specialty: specialty.trim(),
      bio: bio || '',
      photo: photo || 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400',
      active: true,
      createdAt: new Date()
    };

    await req.db.collection('dentists').insertOne(newDentist);
    res.json({ success: true, message: 'Dentist profile created.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add dentist profile.' });
  }
});

adminRouter.get('/api/admin/contacts', verifyAdminAuth, async (req, res) => {
  try {
    const contacts = await req.db.collection('contacts').find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data: contacts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve messages.' });
  }
});

adminRouter.delete('/api/admin/contacts/:id', verifyAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await req.db.collection('contacts').deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true, message: 'Message deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to remove message.' });
  }
});

// ==========================================
// 6. ADMIN LOGIN PAGE (HTML/CSS)
// ==========================================
adminRouter.get('/admin/login', (req, res) => {
  if (req.cookies.cavalry_admin_token) {
    try {
      jwt.verify(req.cookies.cavalry_admin_token, JWT_SECRET);
      return res.redirect('/admin');
    } catch (e) {}
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Staff Portal Login — Cavalry Dental Care</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Poppins:wght@700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    :root {
      --primary: #4F8CFF;
      --bg: #F4F7FF;
      --card-bg: #FFFFFF;
      --text: #25324A;
      --text-muted: #68758A;
      --clay-card: 16px 16px 32px #d5e0f5, -16px -16px 32px #ffffff;
      --clay-input: inset 4px 4px 8px #dce5f7, inset -4px -4px 8px #ffffff;
      --clay-btn: 8px 8px 18px #cbd9f3, -8px -8px 18px #ffffff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .login-card {
      background: var(--card-bg);
      border-radius: 32px;
      padding: 44px;
      width: 100%;
      max-width: 440px;
      box-shadow: var(--clay-card);
      border: 3px solid #ffffff;
      text-align: center;
    }
    .brand-icon {
      width: 60px; height: 60px; border-radius: 50%;
      background: var(--primary); color: #fff; display: flex;
      align-items: center; justify-content: center; font-size: 1.6rem;
      margin: 0 auto 16px; box-shadow: 4px 4px 12px rgba(79, 140, 255, 0.4);
    }
    .login-card h2 { font-size: 1.6rem; font-weight: 800; margin-bottom: 6px; }
    .login-card p { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 28px; }
    .form-group { text-align: left; margin-bottom: 18px; }
    .form-group label { display: block; font-size: 0.85rem; font-weight: 700; margin-bottom: 6px; }
    .clay-input {
      width: 100%; padding: 14px 18px; border-radius: 16px; border: 1.5px solid transparent;
      background: #F4F7FF; color: var(--text); font-family: inherit; font-size: 0.95rem;
      box-shadow: var(--clay-input); outline: none;
    }
    .clay-input:focus { background: #FFFFFF; border-color: var(--primary); }
    .clay-btn {
      width: 100%; padding: 14px; border-radius: 9999px; font-weight: 700; font-size: 1rem;
      background: var(--primary); color: #fff; border: none; cursor: pointer; box-shadow: var(--clay-btn);
      margin-top: 10px; transition: all 0.2s ease;
    }
    .clay-btn:hover { background: #3d79ed; transform: translateY(-2px); }
    .alert-box { padding: 12px; border-radius: 12px; font-size: 0.88rem; font-weight: 600; margin-bottom: 18px; display: none; }
    .alert-box.error { background: #fde8ea; color: #E85D75; }
    .back-link { display: inline-block; margin-top: 20px; font-size: 0.88rem; color: var(--text-muted); text-decoration: none; font-weight: 600; }
    .back-link:hover { color: var(--primary); }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="brand-icon"><i class="fa-solid fa-tooth"></i></div>
    <h2>Staff Administration</h2>
    <p>Cavalry Dental Care Management Portal</p>

    <div id="alertBox" class="alert-box error"></div>

    <form onsubmit="handleLogin(event)">
      <div class="form-group">
        <label for="email"><i class="fa-solid fa-envelope"></i> Staff Email</label>
        <input type="email" id="email" class="clay-input" placeholder="admin@cavalrydental.pk" required>
      </div>

      <div class="form-group">
        <label for="password"><i class="fa-solid fa-lock"></i> Password</label>
        <input type="password" id="password" class="clay-input" placeholder="••••••••••••" required>
      </div>

      <button type="submit" id="submitBtn" class="clay-btn">Authenticate & Access</button>
    </form>

    <a href="/" class="back-link"><i class="fa-solid fa-arrow-left"></i> Return to Clinic Website</a>
  </div>

  <script>
    async function handleLogin(e) {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      const alertBox = document.getElementById('alertBox');
      alertBox.style.display = 'none';

      btn.disabled = true;
      btn.textContent = 'Verifying credentials...';

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
          })
        });

        const data = await res.json();
        if (data.success) {
          window.location.href = '/admin';
        } else {
          alertBox.textContent = data.message || 'Invalid administrative credentials.';
          alertBox.style.display = 'block';
        }
      } catch (err) {
        alertBox.textContent = 'Failed to reach authentication server.';
        alertBox.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Authenticate & Access';
      }
    }
  </script>
</body>
</html>`);
});

// ==========================================
// 7. MAIN ADMIN CLAYMORPHISM SPA DASHBOARD
// ==========================================
adminRouter.get('/admin', verifyAdminAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clinic Dashboard — Cavalry Dental Care</title>
  
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Poppins:wght@700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

  <style>
    :root {
      --primary: #4F8CFF;
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

      --clay-card: 14px 14px 28px #d5e0f5, -14px -14px 28px #ffffff;
      --clay-btn: 6px 6px 14px #cbd9f3, -6px -6px 14px #ffffff;
      --clay-input: inset 3px 3px 6px #dce5f7, inset -3px -3px 6px #ffffff;
      --radius-sm: 16px;
      --radius-md: 24px;
      --radius-lg: 30px;
      --radius-pill: 9999px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: var(--bg);
      color: var(--text);
      display: flex;
      min-height: 100vh;
    }

    .sidebar {
      width: 260px;
      background: #FFFFFF;
      padding: 30px 20px;
      border-right: 2px solid #e7effc;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 40px; }
    .brand-icon {
      width: 44px; height: 44px; border-radius: 50%;
      background: var(--primary); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.25rem; box-shadow: 4px 4px 10px rgba(79, 140, 255, 0.3);
    }
    .brand h2 { font-size: 1.15rem; font-weight: 800; line-height: 1.1; }
    .brand span { font-size: 0.72rem; color: var(--primary); font-weight: 700; text-transform: uppercase; }

    .nav-menu { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .nav-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 18px; border-radius: var(--radius-pill);
      text-decoration: none; color: var(--text-muted);
      font-weight: 700; font-size: 0.92rem; cursor: pointer;
      transition: all 0.2s ease;
    }
    .nav-item:hover, .nav-item.active { background: var(--sky); color: var(--primary); }

    .main-wrapper { flex-grow: 1; padding: 30px 40px; overflow-y: auto; }
    .top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; }
    .top-bar h1 { font-size: 1.8rem; font-weight: 800; }
    .user-pill {
      display: flex; align-items: center; gap: 12px; background: #FFFFFF;
      padding: 8px 18px; border-radius: var(--radius-pill); box-shadow: var(--clay-btn);
    }

    .stat-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 20px; margin-bottom: 35px;
    }
    .stat-card {
      background: #FFFFFF; border-radius: var(--radius-md); padding: 22px;
      box-shadow: var(--clay-card);
