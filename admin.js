/**
 * Cavalry Dental Care — Administrative Subsystem & Management Router
 * Architecture: Mounted Express Router with Claymorphism SPA Dashboard,
 * secure JWT-in-HTTP-Only cookie authentication, rate limiting, and CRUD APIs.
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
// Pre-hashed fallback for demonstration: 'Admin@Cavalry2026!'
const DEFAULT_PASSWORD_HASH = '$2a$10$U9Hk221Kszr3.q5Q1qLcA.lYxP8fV65M6Wk2e38MsmzQvX3B/b1C6';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || DEFAULT_PASSWORD_HASH;

// ==========================================
// 1. DATABASE INDEX & SEED INITIALIZER
// ==========================================
async function initializeDatabaseIndexes(db) {
  try {
    // 1. Appointments index: Unique compound index to guarantee atomic double-booking prevention
    // Prevents inserting overlapping appointments for the same dentist, date, and slot
    // unless status is cancelled.
    await db.collection('appointments').createIndex(
      { dentistId: 1, appointmentDate: 1, timeSlot: 1 },
      { 
        unique: true, 
        partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } }
      }
    );

    // 2. Booking reference lookup index
    await db.collection('appointments').createIndex({ bookingReference: 1 }, { unique: true });

    // 3. Status and date query indexes
    await db.collection('appointments').createIndex({ appointmentDate: 1, status: 1 });

    // 4. Default services seed check
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

    // 5. Default dentists seed check
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

    const passwordMatches = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid administrative credentials.' });
    }

    // Generate signed JWT valid for 8 hours
    const token = jwt.sign(
      { email: ADMIN_EMAIL, role: 'administrator' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.cookie('cavalry_admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
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
// 4. ADMIN DASHBOARD DATA & CRUD APIS
// ==========================================

// Dashboard Analytics Counter
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
    console.error('Error fetching stats:', err);
    res.status(500).json({ success: false, message: 'Failed to compute dashboard analytics.' });
  }
});

// Appointment Listing with Search & Filters
adminRouter.get('/api/admin/appointments', verifyAdminAuth, async (req, res) => {
  try {
    const { search, status, date, dentistId } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (date) {
      query.appointmentDate = date;
    }

    if (dentistId && dentistId !== 'all') {
      query.dentistId = dentistId;
    }

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

// Update Appointment Status, Notes, or Reschedule
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

    // Concurrency safe check if rescheduling to a new slot
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
    console.error('Update appointment error:', err);
    res.status(500).json({ success: false, message: 'Failed to update appointment record.' });
  }
});

// Export Filtered Appointments as CSV
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

// Services Management CRUD
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
