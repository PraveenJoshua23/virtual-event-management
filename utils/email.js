const nodemailer = require('nodemailer');
const { EMAIL_USER, EMAIL_PASS } = require('../config/config');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

const sendEmail = async (to, subject, text) => {
    try {
        await transporter.sendMail({
            from: EMAIL_USER,
            to,
            subject,
            text
        });
        return { success: true };
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
};

const sendBulkEmails = async (recipients) => {
    try {
        const emailPromises = recipients.map(({ email, subject, text }) => 
            sendEmail(email, subject, text)
        );
        await Promise.allSettled(emailPromises);
    } catch (error) {
        console.error('Error in bulk email sending:', error);
        throw new Error('Failed to send some notifications');
    }
};

module.exports = { sendEmail, sendBulkEmails };