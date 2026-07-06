import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

// Helper function to sanitize HTML
function sanitizeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function POST(request: NextRequest) {
  try {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com'
    const port = parseInt(process.env.SMTP_PORT || '465')
    const secure = process.env.SMTP_SECURE !== 'false'
    const user = process.env.SMTP_USER?.trim()
    const pass = process.env.SMTP_PASS?.trim()
    const receiver = process.env.CONTACT_RECEIVER?.trim() || 'impactvisuals21@gmail.com'

    // Prevent crashes if SMTP credentials are missing
    if (!user || !pass) {
      console.error('SMTP credentials (SMTP_USER/SMTP_PASS) are missing from configuration variables.')
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again later.' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { name, email, phone, message } = body

    // Server-side validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      )
    }

    if (phone !== undefined && phone !== null && phone !== '') {
      if (typeof phone !== 'string' || phone.trim().length > 30) {
        return NextResponse.json(
          { error: 'Phone number is invalid' },
          { status: 400 }
        )
      }
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Sanitize inputs
    const sanitizedName = sanitizeHtml(name.trim())
    const sanitizedEmail = sanitizeHtml(email.trim())
    const sanitizedPhone = phone ? sanitizeHtml(phone.trim()) : 'Not provided'
    const sanitizedMessage = sanitizeHtml(message.trim())

    // Create transporter using configured SMTP settings
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    })

    // Verify transporter configuration connection
    try {
      await transporter.verify()
      console.log('SMTP connection verified successfully.')
    } catch (verifyError) {
      console.error('SMTP connection verification failed:', verifyError)
      return NextResponse.json(
        { error: 'Unable to connect to the email server. Please try again later.' },
        { status: 500 }
      )
    }

    // Email content options
    const mailOptions = {
      from: `"${sanitizedName}" <${user}>`,
      to: receiver,
      replyTo: sanitizedEmail,
      subject: 'New Contact Form Submission',
      text: `New Contact Form Submission\n\nName: ${sanitizedName}\nEmail: ${sanitizedEmail}\nPhone: ${sanitizedPhone}\nMessage: ${sanitizedMessage}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
          <h2 style="color: #0070f3; border-bottom: 2px solid #0070f3; padding-bottom: 5px;">New Contact Form Submission</h2>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #eee;">
            <p><strong>Name:</strong> ${sanitizedName}</p>
            <p><strong>Email:</strong> ${sanitizedEmail}</p>
            <p><strong>Phone:</strong> ${sanitizedPhone}</p>
            <p><strong>Message:</strong></p>
            <p style="background: white; padding: 15px; border-radius: 4px; border: 1px solid #ddd; white-space: pre-wrap;">${sanitizedMessage}</p>
          </div>
        </div>
      `,
    }

    // Send email
    await transporter.sendMail(mailOptions)

    // Save to Supabase database
    try {
      const { supabase } = await import('@/lib/supabase')
      const { error: dbError } = await supabase
        .from('leads')
        .insert([
          {
            name: sanitizedName,
            email: sanitizedEmail,
            phone: phone ? sanitizedPhone : null,
            message: sanitizedMessage,
          },
        ])

      if (dbError) {
        console.error('Error saving to database:', dbError)
      }
    } catch (dbErr) {
      console.error('Database save error:', dbErr)
    }

    return NextResponse.json(
      { message: 'Email sent successfully' },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error in route execution:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred while sending your message. Please try again.' },
      { status: 500 }
    )
  }
}

