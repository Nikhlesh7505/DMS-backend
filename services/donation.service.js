const Donation = require('../models/Donation');
const { getIO } = require('../config/socket');

class DonationService {
  startDonationMonitoring() {
    console.log('Donation monitoring service started');
    // Run every day. For testing, we can run every hour, but 24h is good: 24 * 60 * 60 * 1000
    // setInterval(this.flagExpiredDonations.bind(this), 24 * 60 * 60 * 1000);
    
    // For practical purposes in this project, run every 10 minutes to be responsive in dev:
    setInterval(this.flagExpiredDonations.bind(this), 10 * 60 * 1000);
    
    // Initial run
    this.flagExpiredDonations();
  }

  async flagExpiredDonations() {
    try {
      // Find donations older than 7 days that are still Pending and not flagged
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const expiredDonations = await Donation.find({
        status: 'Pending',
        createdAt: { $lt: sevenDaysAgo },
        flagged: false
      });

      if (expiredDonations.length === 0) return;

      const ids = expiredDonations.map(d => d._id);
      
      await Donation.updateMany(
        { _id: { $in: ids } },
        { 
          $set: { 
            flagged: true,
            flaggedAt: new Date()
          } 
        }
      );

      console.log(`Flagged ${expiredDonations.length} expired donations.`);

      // Notify admin
      const io = getIO();
      if (io) {
        io.to('role:admin').emit('donation:flagged', {
          count: expiredDonations.length,
          message: `${expiredDonations.length} pending donation(s) have expired (7 days) and were flagged.`
        });
      }
    } catch (error) {
      console.error('Error in flagExpiredDonations:', error);
    }
  }
}

module.exports = new DonationService();
