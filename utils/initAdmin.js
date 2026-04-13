/**
 * Initialize Admin User
 * Creates default admin user if none exists
 */

const User = require('../models/User');

const initAdmin = async () => {
  try {
    // Check if any admin exists
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (adminExists) {
      console.log('Admin user already exists');
      return;
    }
    
    // Create default admin
    const adminData = {
      name: 'System Administrator',
      email: process.env.ADMIN_EMAIL || 'admin@disaster.gov',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      role: 'admin',
      isActive: true,
      isVerified: true,
      approvalStatus: 'approved',
      phone: '7505272336'
    };
    
    const admin = await User.create(adminData);
    
    console.log('=================================');
    console.log('Default Admin User Created:');
    console.log(`Email: ${adminData.email}`);
    console.log(`Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
    console.log('=================================');
    console.log('IMPORTANT: Please change the default password after first login!');
    console.log('=================================');
    
    return admin;
  } catch (error) {
    console.error('Error creating admin user:', error.message);
  }
};

module.exports = initAdmin;
