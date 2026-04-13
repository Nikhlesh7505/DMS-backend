/**
 * Email Templates
 * HTML email templates for various notifications
 */

const getBaseTemplate = (content) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c3e50; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 20px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .btn { display: inline-block; padding: 10px 20px; background-color: #3498db; color: white; text-decoration: none; border-radius: 5px; }
        .alert { padding: 15px; margin: 10px 0; border-radius: 5px; }
        .alert-info { background-color: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
        .alert-warning { background-color: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
        .alert-danger { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
      </style>
    </head>
    <body>
      <div class="container">
        ${content}
      </div>
    </body>
    </html>
  `;
};

const welcomeEmail = (name, role) => {
  const content = `
    <div class="header">
      <h1>Welcome to Disaster Management System</h1>
    </div>
    <div class="content">
      <h2>Hello ${name},</h2>
      <p>Welcome to the Disaster Management System! Your account has been successfully created as a <strong>${role}</strong>.</p>
      
      <div class="alert alert-info">
        <strong>Account Status:</strong> ${role === 'ngo' || role === 'rescue_team' ? 'Pending Approval' : 'Active'}
      </div>
      
      ${role === 'ngo' || role === 'rescue_team' ? `
        <p>Your account is currently pending admin approval. You will be notified once your account is approved.</p>
      ` : ''}
      
      <p>You can now log in to access your dashboard and features.</p>
      
      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.CLIENT_URL}/login" class="btn">Login to Your Account</a>
      </p>
    </div>
    <div class="footer">
      <p>This is an automated message from the Disaster Management System.</p>
      <p>&copy; ${new Date().getFullYear()} Disaster Management Authority. All rights reserved.</p>
    </div>
  `;
  
  return {
    subject: 'Welcome to Disaster Management System',
    html: getBaseTemplate(content)
  };
};

const accountApprovedEmail = (name, role) => {
  const content = `
    <div class="header" style="background-color: #27ae60;">
      <h1>Account Approved</h1>
    </div>
    <div class="content">
      <h2>Hello ${name},</h2>
      <p>Great news! Your ${role} account has been approved by the administrator.</p>
      
      <div class="alert alert-info">
        <strong>Status:</strong> Approved and Active
      </div>
      
      <p>You can now access all features of the Disaster Management System.</p>
      
      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.CLIENT_URL}/login" class="btn">Access Dashboard</a>
      </p>
    </div>
    <div class="footer">
      <p>This is an automated message from the Disaster Management System.</p>
    </div>
  `;
  
  return {
    subject: 'Your Account Has Been Approved',
    html: getBaseTemplate(content)
  };
};

const passwordResetEmail = (name, resetToken) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  
  const content = `
    <div class="header" style="background-color: #e74c3c;">
      <h1>Password Reset Request</h1>
    </div>
    <div class="content">
      <h2>Hello ${name},</h2>
      <p>We received a request to reset your password. Click the button below to reset it:</p>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" class="btn">Reset Password</a>
      </p>
      
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #3498db;">${resetUrl}</p>
      
      <div class="alert alert-warning">
        <strong>Important:</strong> This link will expire in 1 hour. If you didn't request this, please ignore this email.
      </div>
    </div>
    <div class="footer">
      <p>This is an automated message from the Disaster Management System.</p>
    </div>
  `;
  
  return {
    subject: 'Password Reset Request',
    html: getBaseTemplate(content)
  };
};

const emergencyRequestConfirmation = (name, requestId, type) => {
  const content = `
    <div class="header" style="background-color: #e67e22;">
      <h1>Emergency Request Received</h1>
    </div>
    <div class="content">
      <h2>Hello ${name},</h2>
      <p>Your emergency request has been received and is being processed.</p>
      
      <div class="alert alert-info">
        <p><strong>Request ID:</strong> ${requestId}</p>
        <p><strong>Type:</strong> ${type}</p>
        <p><strong>Status:</strong> Pending</p>
      </div>
      
      <p>Our team is working on your request. You will receive updates as the status changes.</p>
      
      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.CLIENT_URL}/dashboard/requests" class="btn">Track Request</a>
      </p>
    </div>
    <div class="footer">
      <p>In case of immediate danger, call emergency services: <strong>108</strong></p>
      <p>This is an automated message from the Disaster Management System.</p>
    </div>
  `;
  
  return {
    subject: `Emergency Request Received - ${requestId}`,
    html: getBaseTemplate(content)
  };
};

const taskAssignedEmail = (name, taskTitle, taskType) => {
  const content = `
    <div class="header" style="background-color: #9b59b6;">
      <h1>New Task Assigned</h1>
    </div>
    <div class="content">
      <h2>Hello ${name},</h2>
      <p>You have been assigned a new rescue task.</p>
      
      <div class="alert alert-info">
        <p><strong>Task:</strong> ${taskTitle}</p>
        <p><strong>Type:</strong> ${taskType}</p>
      </div>
      
      <p>Please review the task details and update your status accordingly.</p>
      
      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.CLIENT_URL}/dashboard/tasks" class="btn">View Task</a>
      </p>
    </div>
    <div class="footer">
      <p>This is an automated message from the Disaster Management System.</p>
    </div>
  `;
  
  return {
    subject: 'New Task Assigned',
    html: getBaseTemplate(content)
  };
};

const alertNotificationEmail = (alert) => {
  const severityColors = {
    info: '#3498db',
    watch: '#f39c12',
    warning: '#e67e22',
    danger: '#e74c3c',
    emergency: '#c0392b'
  };
  
  const content = `
    <div class="header" style="background-color: ${severityColors[alert.severity] || '#3498db'};">
      <h1>${alert.title}</h1>
      <p>Severity: ${alert.severity.toUpperCase()}</p>
    </div>
    <div class="content">
      <div class="alert alert-${alert.severity === 'danger' || alert.severity === 'emergency' ? 'danger' : 'warning'}">
        <p>${alert.message}</p>
      </div>
      
      ${alert.instructions ? `
        <h3>Safety Instructions:</h3>
        
        ${alert.instructions.before?.length ? `
          <h4>Before:</h4>
          <ul>
            ${alert.instructions.before.map(i => `<li>${i}</li>`).join('')}
          </ul>
        ` : ''}
        
        ${alert.instructions.during?.length ? `
          <h4>During:</h4>
          <ul>
            ${alert.instructions.during.map(i => `<li>${i}</li>`).join('')}
          </ul>
        ` : ''}
        
        ${alert.instructions.after?.length ? `
          <h4>After:</h4>
          <ul>
            ${alert.instructions.after.map(i => `<li>${i}</li>`).join('')}
          </ul>
        ` : ''}
      ` : ''}
      
      <div style="margin-top: 30px; padding: 15px; background-color: #ecf0f1; border-radius: 5px;">
        <p><strong>Alert Code:</strong> ${alert.alertCode}</p>
        <p><strong>Issued:</strong> ${alert.timeline.issuedAt.toLocaleString()}</p>
        <p><strong>Expires:</strong> ${alert.timeline.expiresAt.toLocaleString()}</p>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated alert from the Disaster Management System.</p>
      <p>Stay safe and follow official instructions.</p>
    </div>
  `;
  
  return {
    subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
    html: getBaseTemplate(content)
  };
};

module.exports = {
  welcomeEmail,
  accountApprovedEmail,
  passwordResetEmail,
  emergencyRequestConfirmation,
  taskAssignedEmail,
  alertNotificationEmail
};
