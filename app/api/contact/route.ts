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

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true
  const lower = value.toLowerCase()
  return (
    lower.includes('placeholder') ||
    lower.includes('your_gmail') ||
    lower.includes('your-16-char') ||
    lower.includes('your-16-character') ||
    lower.includes('your_gmail_address') ||
    lower.includes('your_gmail_app_password')
  )
}

export async function POST(request: NextRequest) {
  try {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com'
    const port = parseInt(process.env.SMTP_PORT || '465')
    const secure = process.env.SMTP_SECURE !== 'false'
    const user = process.env.SMTP_USER?.trim() || process.env.EMAIL_USER?.trim()
    const pass = process.env.SMTP_PASS?.trim() || process.env.EMAIL_PASSWORD?.trim()
    const receiver = process.env.CONTACT_RECEIVER?.trim() || 'impactvisuals21@gmail.com'

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

    const hasSmtpConfig = !isPlaceholder(user) && !isPlaceholder(pass)
    const isDbPlaceholder = isPlaceholder(process.env.NEXT_PUBLIC_SUPABASE_URL)

    // Handle development mock mode when both email and database are unconfigured/placeholders
    if (!hasSmtpConfig && isDbPlaceholder) {
      console.warn('Development Mode: SMTP and Supabase are not configured. Returning successful mock submission and logging details to console.')
      console.log('--- DEVELOPMENT MOCK SUBMISSION ---')
      console.log('Name:', sanitizedName)
      console.log('Email:', sanitizedEmail)
      console.log('Phone:', sanitizedPhone)
      console.log('Message:', sanitizedMessage)
      console.log('-----------------------------------')
      return NextResponse.json(
        {
          message: 'Development Mock Success: Message received (No database or email is configured).',
          mockMode: true
        },
        { status: 200 }
      )
    }

    let emailSent = false
    let emailErrorMsg = ''

    if (hasSmtpConfig) {
      try {
        // Create transporter using configured SMTP settings
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: {
            user: user!,
            pass: pass!,
          },
        })

        // Verify transporter configuration connection
        await transporter.verify()
        console.log('SMTP connection verified successfully.')

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
        emailSent = true
        console.log('Email sent successfully.')
      } catch (err: any) {
        console.error('SMTP sending / verification failed:', err)
        emailErrorMsg = err instanceof Error ? err.message : String(err)
      }
    } else {
      console.warn('SMTP credentials are not configured or are placeholder values. Skipping email sending...')
    }

    // Save to Supabase database if configured
    let dbSaved = false
    let dbErrorMsg = ''

    if (!isDbPlaceholder) {
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
          dbErrorMsg = dbError.message || JSON.stringify(dbError)
        } else {
          dbSaved = true
          console.log('Lead saved to database successfully.')
        }
      } catch (dbErr: any) {
        console.error('Database save error:', dbErr)
        dbErrorMsg = dbErr instanceof Error ? dbErr.message : String(dbErr)
      }
    } else {
      console.warn('Supabase URL is not configured or is a placeholder. Skipping database save.')
    }

    // Determine the response based on results
    if (emailSent || dbSaved) {
      let msg = 'Message received successfully.'
      if (emailSent && dbSaved) {
        msg = 'Email sent and lead saved successfully.'
      } else if (emailSent) {
        msg = 'Email sent successfully.'
      } else if (dbSaved) {
        msg = 'Message received and saved successfully.'
      }

      return NextResponse.json(
        {
          message: msg,
          emailSent,
          dbSaved
        },
        { status: 200 }
      )
    }

    // If both failed
    return NextResponse.json(
      {
        error: 'Service temporarily unavailable. Please try again later.',
        details: { emailError: emailErrorMsg, dbError: dbErrorMsg }
      },
      { status: 500 }
    )

  } catch (error: any) {
    console.error('Error in route execution:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred while sending your message. Please try again.' },
      { status: 500 }
    )
  }
}

