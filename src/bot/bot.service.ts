import { Injectable, OnModuleInit } from '@nestjs/common'
import { Markup, Telegraf } from 'telegraf'
import { PrismaService } from '../prisma/prisma.service'

const BUTTONS = {
  browse: '📚 تصفح الملفات',
  admin: '⚙️ لوحة الإدارة',
  addYear: '➕ إضافة سنة',
  addTerm: '➕ إضافة فصل',
  addCourse: '➕ إضافة مادة',
  addFile: '📎 إضافة ملف',
  deleteFile: '🗑️ حذف ملف',
  addAdmin: '👤 إضافة أدمن',
  listAdmins: '📋 قائمة الأدمن',
  removeAdmin: '❌ حذف أدمن',
  back: '⬅️ رجوع',
  cancel: '❌ إلغاء',
  mainMenu: '🏠 القائمة الرئيسية',
} as const

type UserState =
  | { mode: 'idle' }
  | { mode: 'browseYear' }
  | { mode: 'browseTerm'; yearId: number }
  | { mode: 'browseCourse'; yearId: number; termId: number }
  | { mode: 'adminPanel' }
  | { mode: 'addYearName' }
  | { mode: 'addTermYear' }
  | { mode: 'addTermName'; yearId: number }
  | { mode: 'addCourseYear' }
  | { mode: 'addCourseTerm'; yearId: number }
  | { mode: 'addCourseName'; yearId: number; termId: number }
  | { mode: 'addFileYear' }
  | { mode: 'addFileTerm'; yearId: number }
  | { mode: 'addFileCourse'; yearId: number; termId: number }
  | { mode: 'addFileUpload'; yearId: number; termId: number; courseId: number }
  | { mode: 'deleteFileYear' }
  | { mode: 'deleteFileTerm'; yearId: number }
  | { mode: 'deleteFileCourse'; yearId: number; termId: number }
  | { mode: 'deleteFileFile'; yearId: number; termId: number; courseId: number }
  | { mode: 'addAdminId' }
  | { mode: 'removeAdminId' }

@Injectable()
export class BotService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  bot = new Telegraf(process.env.BOT_TOKEN!)
  private readonly userStates = new Map<number, UserState>()

  async onModuleInit() {
    this.bot.start(async ctx => {
      this.clearUserState(ctx)
      await this.showMainMenu(ctx, 'أهلا بك في بوت الملفات. اختر العملية:')
    })

    this.bot.command('menu', async ctx => {
      this.clearUserState(ctx)
      await this.showMainMenu(ctx)
    })

    this.bot.command('files', async ctx => {
      this.clearUserState(ctx)
      await this.showYearsForBrowse(ctx)
    })

    this.bot.on('text', async ctx => {
      await this.handleTextInput(ctx)
    })

    this.bot.on('document', async ctx => {
      await this.handleDocumentInput(ctx)
    })

    const appUrl = process.env.APP_URL
    if (!appUrl) {
      throw new Error('APP_URL is required to set the Telegram webhook.')
    }
    await this.bot.telegram.setWebhook(`${appUrl}/telegram`)
  }

  private async isAdmin(userId: number): Promise<boolean> {
    try {
      const admin = await this.prisma.admin.findUnique({
        where: { id: BigInt(userId) },
        select: { id: true },
      })

      return Boolean(admin)
    } catch (error) {
      console.error('Error checking admin status:', error)
      return false
    }
  }

  private async ensureAdminAccess(ctx: any, userId?: number): Promise<boolean> {
    if (!userId || !(await this.isAdmin(userId))) {
      this.clearUserState(ctx)
      await this.showMainMenu(ctx, 'ليس لديك صلاحيات الأدمن.')
      return false
    }

    return true
  }

  private async showMainMenu(ctx: any, text = 'اختر العملية:') {
    this.setUserState(ctx, { mode: 'idle' })
    const userId = ctx.from?.id
    const admin = userId ? await this.isAdmin(userId) : false
    await ctx.reply(text, this.mainKeyboard(admin))
  }

  private async showAdminPanel(ctx: any) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) {
      return
    }

    this.setUserState(ctx, { mode: 'adminPanel' })
    await ctx.reply('لوحة الإدارة:', this.adminKeyboard())
  }

  private async showYearsForBrowse(ctx: any, text = 'اختر السنة:') {
    try {
      const years = await this.prisma.year.findMany({
        orderBy: { name: 'asc' },
      })

      if (years.length === 0) {
        await this.showMainMenu(ctx, 'لا توجد سنوات حاليا.')
        return
      }

      this.setUserState(ctx, { mode: 'browseYear' })
      await ctx.reply(text, this.yearsKeyboard(years))
    } catch (error) {
      console.error('Error fetching years:', error)
      await ctx.reply('حدث خطأ في جلب السنوات. الرجاء المحاولة لاحقا.')
    }
  }

  private async showTermsForBrowse(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({
        where: { yearId },
        orderBy: { name: 'asc' },
      })

      if (terms.length === 0) {
        await this.showYearsForBrowse(ctx, 'لا توجد فصول في هذه السنة. اختر سنة أخرى:')
        return
      }

      this.setUserState(ctx, { mode: 'browseTerm', yearId })
      await ctx.reply('اختر الفصل:', this.termsKeyboard(terms))
    } catch (error) {
      console.error('Error fetching terms:', error)
      await ctx.reply('حدث خطأ في جلب الفصول. الرجاء المحاولة لاحقا.')
    }
  }

  private async showCoursesForBrowse(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({
        where: { termId },
        orderBy: { name: 'asc' },
      })

      if (courses.length === 0) {
        await this.showTermsForBrowse(ctx, yearId)
        return
      }

      this.setUserState(ctx, { mode: 'browseCourse', yearId, termId })
      await ctx.reply('اختر المادة:', this.coursesKeyboard(courses))
    } catch (error) {
      console.error('Error fetching courses:', error)
      await ctx.reply('حدث خطأ في جلب المواد. الرجاء المحاولة لاحقا.')
    }
  }

  private async showFilesForBrowse(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
  ) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        include: {
          files: {
            orderBy: { id: 'desc' },
          },
        },
      })

      if (!course || course.termId !== termId) {
        await this.showCoursesForBrowse(ctx, yearId, termId)
        return
      }

      if (course.files.length === 0) {
        // Backward compatibility for old single-file rows.
        if (course.fileId) {
          try {
            await ctx.replyWithDocument(course.fileId, {
              caption: course.name,
            })
            await this.showYearsForBrowse(ctx, 'تم إرسال الملف. اختر السنة:')
            return
          } catch {
            await ctx.reply('تعذر إرسال الملف القديم لهذه المادة.')
          }
        }

        await ctx.reply('لا توجد ملفات لهذه المادة حاليا.')
        await this.showCoursesForBrowse(ctx, yearId, termId)
        return
      }

      for (const file of course.files) {
        try {
          await ctx.replyWithDocument(file.fileId, {
            caption: file.name ?? course.name,
          })
        } catch {
          await ctx.reply(`تعذر إرسال الملف: ${file.name ?? `#${file.id}`}`)
        }
      }

      await this.showYearsForBrowse(ctx, 'تم إرسال جميع ملفات المادة. اختر السنة:')
    } catch (error) {
      console.error('Error fetching files:', error)
      await ctx.reply('حدث خطأ في جلب الملفات. الرجاء المحاولة لاحقا.')
    }
  }

  private async showYearsForAddTerm(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({
        orderBy: { name: 'asc' },
      })

      if (years.length === 0) {
        await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard())
        return
      }

      this.setUserState(ctx, { mode: 'addTermYear' })
      await ctx.reply('اختر السنة لإضافة فصل:', this.yearsKeyboard(years))
    } catch (error) {
      console.error('Error fetching years for add term:', error)
      await ctx.reply('حدث خطأ. الرجاء المحاولة لاحقا.', this.adminKeyboard())
    }
  }

  private async showYearsForAddCourse(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({
        orderBy: { name: 'asc' },
      })

      if (years.length === 0) {
        await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard())
        return
      }

      this.setUserState(ctx, { mode: 'addCourseYear' })
      await ctx.reply('اختر السنة لإضافة مادة:', this.yearsKeyboard(years))
    } catch (error) {
      console.error('Error fetching years for add course:', error)
      await ctx.reply('حدث خطأ. الرجاء المحاولة لاحقا.', this.adminKeyboard())
    }
  }

  private async showTermsForAddCourse(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({
        where: { yearId },
        orderBy: { name: 'asc' },
      })

      if (terms.length === 0) {
        await ctx.reply('لا توجد فصول في هذه السنة. أضف فصل أولا.', this.adminKeyboard())
        return
      }

      this.setUserState(ctx, { mode: 'addCourseTerm', yearId })
      await ctx.reply('اختر الفصل لإضافة مادة:', this.termsKeyboard(terms))
    } catch (error) {
      console.error('Error fetching terms for add course:', error)
      await ctx.reply('حدث خطأ. الرجاء المحاولة لاحقا.', this.adminKeyboard())
    }
  }

  private async showYearsForAddFile(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({
        orderBy: { name: 'asc' },
      })

      if (years.length === 0) {
        await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard())
        return
      }

      this.setUserState(ctx, { mode: 'addFileYear' })
      await ctx.reply('اختر السنة لإضافة ملف:', this.yearsKeyboard(years))
    } catch (error) {
      console.error('Error fetching years for add file:', error)
      await ctx.reply('حدث خطأ. الرجاء المحاولة لاحقا.', this.adminKeyboard())
    }
  }

  private async showTermsForAddFile(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({
        where: { yearId },
        orderBy: { name: 'asc' },
      })

      if (terms.length === 0) {
        await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard())
        return
      }

      this.setUserState(ctx, { mode: 'addFileTerm', yearId })
      await ctx.reply('اختر الفصل لإضافة ملف:', this.termsKeyboard(terms))
    } catch (error) {
      console.error('Error fetching terms for add file:', error)
      await ctx.reply('حدث خطأ. الرجاء المحاولة لاحقا.', this.adminKeyboard())
    }
  }

  private async showCoursesForAddFile(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({
        where: { termId },
        orderBy: { name: 'asc' },
      })

      if (courses.length === 0) {
        await ctx.reply('لا توجد مواد في هذا الفصل. أضف مادة أولا.', this.adminKeyboard())
        return
      }

      this.setUserState(ctx, { mode: 'addFileCourse', yearId, termId })
      await ctx.reply('اختر المادة لإضافة ملف:', this.coursesKeyboard(courses))
    } catch (error) {
      console.error('Error fetching courses for add file:', error)
      await ctx.reply('حدث خطأ. الرجاء المحاولة لاحقا.', this.adminKeyboard())
    }
  }

  private async showYearsForDeleteFile(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({
        orderBy: { name: 'asc' },
      })

      if (years.length === 0) {
        await ctx.reply('لا توجد سنوات حاليا.', this.adminKeyboard())
        return
      }

      this.setUserState(ctx, { mode: 'deleteFileYear' })
      await ctx.reply('اختر السنة لحذف ملف:', this.yearsKeyboard(years))
    } catch (error) {
      console.error('Error fetching years for delete file:', error)
      await ctx.reply('حدث خطأ. الرجاء المحاولة لاحقا.', this.adminKeyboard())
    }
  }

  private async showTermsForDeleteFile(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({
        where: { yearId },
        orderBy: { name: 'asc' },
      })

      if (terms.length === 0) {
        await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard())
        return
      }

      this.setUserState(ctx, { mode: 'deleteFileTerm', yearId })
      await ctx.reply('اختر الفصل لحذف ملف:', this.termsKeyboard(terms))
    } catch (error) {
      console.error('Error fetching terms for delete file:', error)
      await ctx.reply('حدث خطأ. الرجاء المحاولة لاحقا.', this.adminKeyboard())
    }
  }

  private async showCoursesForDeleteFile(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({
        where: { termId },
        orderBy: { name: 'asc' },
      })

      if (courses.length === 0) {
        await ctx.reply('لا توجد مواد في هذا الفصل.', this.adminKeyboard())
        return
      }

      this.setUserState(ctx, { mode: 'deleteFileCourse', yearId, termId })
      await ctx.reply('اختر المادة لحذف ملف منها:', this.coursesKeyboard(courses))
    } catch (error) {
      console.error('Error fetching courses for delete file:', error)
      await ctx.reply('حدث خطأ. الرجاء المحاولة لاحقا.', this.adminKeyboard())
    }
  }

  private async showFilesForDeleteFile(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
  ) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        include: {
          files: {
            orderBy: { id: 'desc' },
          },
        },
      })

      if (!course || course.termId !== termId) {
        await this.showCoursesForDeleteFile(ctx, yearId, termId)
        return
      }

      if (course.files.length === 0) {
        await ctx.reply('لا توجد ملفات لهذه المادة.', this.adminKeyboard())
        await this.showCoursesForDeleteFile(ctx, yearId, termId)
        return
      }

      this.setUserState(ctx, { mode: 'deleteFileFile', yearId, termId, courseId })
      await ctx.reply('اختر الملف المراد حذفه:', this.filesKeyboard(course.files))
    } catch (error) {
      console.error('Error fetching files for delete:', error)
      await ctx.reply('حدث خطأ. الرجاء المحاولة لاحقا.', this.adminKeyboard())
    }
  }

  private async listAdmins(ctx: any) {
    try {
      const admins = await this.prisma.admin.findMany({
        orderBy: { id: 'asc' },
      })

      if (admins.length === 0) {
        await ctx.reply('لا يوجد أدمن في النظام.', this.adminKeyboard())
        return
      }

      const list = admins.map(a => `• ${a.id.toString()}`).join('\n')
      await ctx.reply(`قائمة الأدمن:\n${list}`, this.adminKeyboard())
    } catch (error) {
      console.error('Error listing admins:', error)
      await ctx.reply('حدث خطأ في جلب قائمة الأدمن.', this.adminKeyboard())
    }
  }

  private async handleTextInput(ctx: any) {
    const text = ctx.message?.text?.trim()
    const userId = ctx.from?.id

    if (!text) {
      return
    }

    if (text === BUTTONS.mainMenu) {
      this.clearUserState(ctx)
      await this.showMainMenu(ctx)
      return
    }

    if (text === BUTTONS.cancel) {
      this.clearUserState(ctx)
      await this.showMainMenu(ctx, 'تم الإلغاء.')
      return
    }

    const state = this.getUserState(ctx)

    if (state.mode === 'idle') {
      await this.handleMainMenuButtons(ctx, text)
      return
    }

    if (state.mode === 'adminPanel') {
      await this.handleAdminPanelButtons(ctx, text)
      return
    }

    if (state.mode === 'browseYear') {
      if (text === BUTTONS.back) {
        await this.showMainMenu(ctx)
        return
      }

      const yearId = this.parseYearId(text)
      if (!yearId) {
        await ctx.reply('اختر سنة من الأزرار.')
        return
      }

      await this.showTermsForBrowse(ctx, yearId)
      return
    }

    if (state.mode === 'browseTerm') {
      if (text === BUTTONS.back) {
        await this.showYearsForBrowse(ctx)
        return
      }

      const termId = this.parseTermId(text)
      if (!termId) {
        await ctx.reply('اختر فصل من الأزرار.')
        return
      }

      await this.showCoursesForBrowse(ctx, state.yearId, termId)
      return
    }

    if (state.mode === 'browseCourse') {
      if (text === BUTTONS.back) {
        await this.showTermsForBrowse(ctx, state.yearId)
        return
      }

      const courseId = this.parseCourseId(text)
      if (!courseId) {
        await ctx.reply('اختر مادة من الأزرار.')
        return
      }

      await this.showFilesForBrowse(ctx, state.yearId, state.termId, courseId)
      return
    }

    if (!(await this.ensureAdminAccess(ctx, userId))) {
      return
    }

    if (state.mode === 'addYearName') {
      if (text === BUTTONS.back) {
        await this.showAdminPanel(ctx)
        return
      }

      await this.createYear(ctx, text)
      return
    }

    if (state.mode === 'addTermYear') {
      if (text === BUTTONS.back) {
        await this.showAdminPanel(ctx)
        return
      }

      const yearId = this.parseYearId(text)
      if (!yearId) {
        await ctx.reply('اختر سنة من الأزرار.')
        return
      }

      this.setUserState(ctx, { mode: 'addTermName', yearId })
      await ctx.reply('أرسل اسم الفصل الجديد:', this.cancelKeyboard())
      return
    }

    if (state.mode === 'addTermName') {
      if (text === BUTTONS.back) {
        await this.showYearsForAddTerm(ctx)
        return
      }

      await this.createTerm(ctx, state.yearId, text)
      return
    }

    if (state.mode === 'addCourseYear') {
      if (text === BUTTONS.back) {
        await this.showAdminPanel(ctx)
        return
      }

      const yearId = this.parseYearId(text)
      if (!yearId) {
        await ctx.reply('اختر سنة من الأزرار.')
        return
      }

      await this.showTermsForAddCourse(ctx, yearId)
      return
    }

    if (state.mode === 'addCourseTerm') {
      if (text === BUTTONS.back) {
        await this.showYearsForAddCourse(ctx)
        return
      }

      const termId = this.parseTermId(text)
      if (!termId) {
        await ctx.reply('اختر فصل من الأزرار.')
        return
      }

      this.setUserState(ctx, { mode: 'addCourseName', yearId: state.yearId, termId })
      await ctx.reply('أرسل اسم المادة الجديدة:', this.cancelKeyboard())
      return
    }

    if (state.mode === 'addCourseName') {
      if (text === BUTTONS.back) {
        await this.showTermsForAddCourse(ctx, state.yearId)
        return
      }

      await this.createCourse(ctx, state.termId, text)
      return
    }

    if (state.mode === 'addFileYear') {
      if (text === BUTTONS.back) {
        await this.showAdminPanel(ctx)
        return
      }

      const yearId = this.parseYearId(text)
      if (!yearId) {
        await ctx.reply('اختر سنة من الأزرار.')
        return
      }

      await this.showTermsForAddFile(ctx, yearId)
      return
    }

    if (state.mode === 'addFileTerm') {
      if (text === BUTTONS.back) {
        await this.showYearsForAddFile(ctx)
        return
      }

      const termId = this.parseTermId(text)
      if (!termId) {
        await ctx.reply('اختر فصل من الأزرار.')
        return
      }

      await this.showCoursesForAddFile(ctx, state.yearId, termId)
      return
    }

    if (state.mode === 'addFileCourse') {
      if (text === BUTTONS.back) {
        await this.showTermsForAddFile(ctx, state.yearId)
        return
      }

      const courseId = this.parseCourseId(text)
      if (!courseId) {
        await ctx.reply('اختر مادة من الأزرار.')
        return
      }

      this.setUserState(ctx, {
        mode: 'addFileUpload',
        yearId: state.yearId,
        termId: state.termId,
        courseId,
      })
      await ctx.reply('أرسل الملف الجديد (Document) أو أرسل file_id كنص.', this.cancelKeyboard())
      return
    }

    if (state.mode === 'addFileUpload') {
      if (text === BUTTONS.back) {
        await this.showCoursesForAddFile(ctx, state.yearId, state.termId)
        return
      }

      await this.createCourseFile(ctx, state.courseId, state.termId, text)
      return
    }

    if (state.mode === 'deleteFileYear') {
      if (text === BUTTONS.back) {
        await this.showAdminPanel(ctx)
        return
      }

      const yearId = this.parseYearId(text)
      if (!yearId) {
        await ctx.reply('اختر سنة من الأزرار.')
        return
      }

      await this.showTermsForDeleteFile(ctx, yearId)
      return
    }

    if (state.mode === 'deleteFileTerm') {
      if (text === BUTTONS.back) {
        await this.showYearsForDeleteFile(ctx)
        return
      }

      const termId = this.parseTermId(text)
      if (!termId) {
        await ctx.reply('اختر فصل من الأزرار.')
        return
      }

      await this.showCoursesForDeleteFile(ctx, state.yearId, termId)
      return
    }

    if (state.mode === 'deleteFileCourse') {
      if (text === BUTTONS.back) {
        await this.showTermsForDeleteFile(ctx, state.yearId)
        return
      }

      const courseId = this.parseCourseId(text)
      if (!courseId) {
        await ctx.reply('اختر مادة من الأزرار.')
        return
      }

      await this.showFilesForDeleteFile(ctx, state.yearId, state.termId, courseId)
      return
    }

    if (state.mode === 'deleteFileFile') {
      if (text === BUTTONS.back) {
        await this.showCoursesForDeleteFile(ctx, state.yearId, state.termId)
        return
      }

      const fileRowId = this.parseFileRowId(text)
      if (!fileRowId) {
        await ctx.reply('اختر ملف من الأزرار.')
        return
      }

      await this.deleteCourseFile(
        ctx,
        state.yearId,
        state.termId,
        state.courseId,
        fileRowId,
      )
      return
    }

    if (state.mode === 'addAdminId') {
      if (text === BUTTONS.back) {
        await this.showAdminPanel(ctx)
        return
      }

      await this.addAdmin(ctx, text)
      return
    }

    if (state.mode === 'removeAdminId') {
      if (text === BUTTONS.back) {
        await this.showAdminPanel(ctx)
        return
      }

      await this.removeAdmin(ctx, text)
    }
  }

  private async handleDocumentInput(ctx: any) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) {
      return
    }

    const state = this.getUserState(ctx)
    if (state.mode !== 'addFileUpload') {
      return
    }

    const fileId = ctx.message?.document?.file_id
    if (!fileId) {
      await ctx.reply('الملف غير صالح. أرسل ملف صحيح.')
      return
    }

    const fileName = ctx.message?.document?.file_name ?? undefined
    await this.createCourseFile(ctx, state.courseId, state.termId, fileId, fileName)
  }

  private async handleMainMenuButtons(ctx: any, text: string) {
    if (text === BUTTONS.browse) {
      await this.showYearsForBrowse(ctx)
      return
    }

    if (text === BUTTONS.admin) {
      await this.showAdminPanel(ctx)
      return
    }

    await this.showMainMenu(ctx, 'اختر خيارا من الأزرار.')
  }

  private async handleAdminPanelButtons(ctx: any, text: string) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) {
      return
    }

    if (text === BUTTONS.back) {
      await this.showMainMenu(ctx)
      return
    }

    if (text === BUTTONS.addYear) {
      this.setUserState(ctx, { mode: 'addYearName' })
      await ctx.reply('أرسل اسم السنة الجديدة:', this.cancelKeyboard())
      return
    }

    if (text === BUTTONS.addTerm) {
      await this.showYearsForAddTerm(ctx)
      return
    }

    if (text === BUTTONS.addCourse) {
      await this.showYearsForAddCourse(ctx)
      return
    }

    if (text === BUTTONS.addFile) {
      await this.showYearsForAddFile(ctx)
      return
    }

    if (text === BUTTONS.deleteFile) {
      await this.showYearsForDeleteFile(ctx)
      return
    }

    if (text === BUTTONS.addAdmin) {
      this.setUserState(ctx, { mode: 'addAdminId' })
      await ctx.reply('أرسل ID المستخدم (Telegram User ID):', this.cancelKeyboard())
      return
    }

    if (text === BUTTONS.listAdmins) {
      await this.listAdmins(ctx)
      return
    }

    if (text === BUTTONS.removeAdmin) {
      this.setUserState(ctx, { mode: 'removeAdminId' })
      await ctx.reply('أرسل ID الأدمن المراد حذفه:', this.cancelKeyboard())
      return
    }

    await this.showAdminPanel(ctx)
  }

  private parseBigIntValue(value: string): bigint | null {
    try {
      if (!/^\d+$/.test(value)) {
        return null
      }
      return BigInt(value)
    } catch {
      return null
    }
  }

  private async addAdmin(ctx: any, adminIdText: string) {
    const adminId = this.parseBigIntValue(adminIdText)
    if (adminId === null) {
      await ctx.reply('ID غير صحيح. أرسل رقم صحيح.')
      return
    }

    try {
      await this.prisma.admin.create({
        data: { id: adminId },
      })

      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة الأدمن: ${adminId.toString()}`)
      await this.showAdminPanel(ctx)
    } catch (error) {
      console.error('Error adding admin:', error)
      await ctx.reply('فشل إضافة الأدمن. قد يكون موجود بالفعل.')
    }
  }

  private async removeAdmin(ctx: any, adminIdText: string) {
    const adminId = this.parseBigIntValue(adminIdText)
    if (adminId === null) {
      await ctx.reply('ID غير صحيح. أرسل رقم صحيح.')
      return
    }

    const userId = ctx.from?.id
    if (userId && adminId === BigInt(userId)) {
      await ctx.reply('لا يمكنك حذف نفسك!')
      return
    }

    try {
      await this.prisma.admin.delete({
        where: { id: adminId },
      })

      this.clearUserState(ctx)
      await ctx.reply(`تم حذف الأدمن: ${adminId.toString()}`)
      await this.showAdminPanel(ctx)
    } catch (error) {
      console.error('Error removing admin:', error)
      await ctx.reply('فشل حذف الأدمن. قد يكون غير موجود.')
    }
  }

  private async createYear(ctx: any, name: string) {
    try {
      const created = await this.prisma.year.create({
        data: { name },
      })

      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة السنة: ${name} (ID: ${created.id})`)
      await this.showAdminPanel(ctx)
    } catch (error) {
      console.error('Error creating year:', error)
      await ctx.reply(`فشل إضافة السنة. الخطأ: ${error.message || 'غير معروف'}`)
    }
  }

  private async createTerm(ctx: any, yearId: number, name: string) {
    try {
      // First verify the year exists
      const year = await this.prisma.year.findUnique({
        where: { id: yearId },
      })

      if (!year) {
        await ctx.reply('السنة غير موجودة. الرجاء المحاولة مرة أخرى.')
        await this.showYearsForAddTerm(ctx)
        return
      }

      const created = await this.prisma.term.create({
        data: { name, yearId },
      })

      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة الفصل: ${name} (ID: ${created.id}) للسنة: ${year.name}`)
      await this.showAdminPanel(ctx)
    } catch (error) {
      console.error('Error creating term:', error)
      await ctx.reply(`فشل إضافة الفصل. الخطأ: ${error.message || 'قد يكون مكرر داخل نفس السنة'}`)
    }
  }

  private async createCourse(ctx: any, termId: number, name: string) {
    try {
      // First verify the term exists
      const term = await this.prisma.term.findUnique({
        where: { id: termId },
        include: { year: true },
      })

      if (!term) {
        await ctx.reply('الفصل غير موجود. الرجاء المحاولة مرة أخرى.')
        return
      }

      const created = await this.prisma.course.create({
        data: { name, termId },
      })

      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة المادة: ${name} (ID: ${created.id}) للفصل: ${term.name} - السنة: ${term.year.name}`)
      await this.showAdminPanel(ctx)
    } catch (error) {
      console.error('Error creating course:', error)
      await ctx.reply(`فشل إضافة المادة. ${termId} ${name}الخطأ: ${error.message || 'غير معروف'}`)
    }
  }

  private async createCourseFile(
    ctx: any,
    courseId: number,
    termId: number,
    fileId: string,
    name?: string,
  ) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, termId: true, name: true },
      })

      if (!course || course.termId !== termId) {
        await ctx.reply('المادة غير موجودة.')
        return
      }

      const created = await this.prisma.courseFile.create({
        data: {
          courseId,
          fileId,
          name: name?.trim() || undefined,
        },
      })

      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة ملف جديد (ID: ${created.id}) للمادة: ${course.name}`)
      await this.showAdminPanel(ctx)
    } catch (error) {
      console.error('Error creating course file:', error)
      await ctx.reply(`فشل إضافة الملف. الخطأ: ${error.message || 'غير معروف'}`)
    }
  }

  private async deleteCourseFile(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
    fileRowId: number,
  ) {
    try {
      const file = await this.prisma.courseFile.findUnique({
        where: { id: fileRowId },
        select: { id: true, courseId: true, name: true },
      })

      if (!file || file.courseId !== courseId) {
        await ctx.reply('الملف غير موجود في هذه المادة.')
        return
      }

      await this.prisma.courseFile.delete({
        where: { id: fileRowId },
      })

      await ctx.reply(`تم حذف الملف: ${file.name ?? `#${file.id}`}`)
      await this.showFilesForDeleteFile(ctx, yearId, termId, courseId)
    } catch (error) {
      console.error('Error deleting course file:', error)
      await ctx.reply(`فشل حذف الملف. الخطأ: ${error.message || 'غير معروف'}`)
    }
  }

  private mainKeyboard(isAdmin: boolean) {
    const buttons = [[Markup.button.text(BUTTONS.browse)]]
    if (isAdmin) {
      buttons.push([Markup.button.text(BUTTONS.admin)])
    }
    return Markup.keyboard(buttons).resize()
  }

  private adminKeyboard() {
    return Markup.keyboard([
      [Markup.button.text(BUTTONS.addYear), Markup.button.text(BUTTONS.addTerm)],
      [Markup.button.text(BUTTONS.addCourse), Markup.button.text(BUTTONS.addFile)],
      [Markup.button.text(BUTTONS.deleteFile)],
      [Markup.button.text(BUTTONS.addAdmin), Markup.button.text(BUTTONS.listAdmins)],
      [Markup.button.text(BUTTONS.removeAdmin)],
      [Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)],
    ]).resize()
  }

  private cancelKeyboard() {
    return Markup.keyboard([
      [Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.cancel)],
      [Markup.button.text(BUTTONS.mainMenu)],
    ]).resize()
  }

  private yearsKeyboard(years: Array<{ id: number; name: string }>) {
    const rows = years.map(year => [Markup.button.text(this.yearLabel(year.id, year.name))])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  private termsKeyboard(terms: Array<{ id: number; name: string }>) {
    const rows = terms.map(term => [Markup.button.text(this.termLabel(term.id, term.name))])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  private coursesKeyboard(courses: Array<{ id: number; name: string }>) {
    const rows = courses.map(course => [Markup.button.text(this.courseLabel(course.id, course.name))])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  private filesKeyboard(files: Array<{ id: number; name: string | null }>) {
    const rows = files.map(file => [Markup.button.text(this.fileLabel(file.id, file.name))])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  private yearLabel(id: number, name: string) {
    return `سنة: ${id} - ${name}`
  }

  private termLabel(id: number, name: string) {
    return `فصل: ${id} - ${name}`
  }

  private courseLabel(id: number, name: string) {
    return `مادة: ${id} - ${name}`
  }

  private fileLabel(id: number, name: string | null) {
    return `ملف: ${id} - ${name ?? `ملف ${id}`}`
  }

  private parseYearId(text: string): number | null {
    const match = text.match(/^سنة:\s*(\d+)\s*-/)
    return match ? Number(match[1]) : null
  }

  private parseTermId(text: string): number | null {
    const match = text.match(/^فصل:\s*(\d+)\s*-/)
    return match ? Number(match[1]) : null
  }

  private parseCourseId(text: string): number | null {
    const match = text.match(/^مادة:\s*(\d+)\s*-/)
    return match ? Number(match[1]) : null
  }

  private parseFileRowId(text: string): number | null {
    const match = text.match(/^ملف:\s*(\d+)\s*-/)
    return match ? Number(match[1]) : null
  }

  private getUserState(ctx: any): UserState {
    const userId = ctx.from?.id
    if (!userId) {
      return { mode: 'idle' }
    }
    return this.userStates.get(userId) ?? { mode: 'idle' }
  }

  private setUserState(ctx: any, state: UserState) {
    const userId = ctx.from?.id
    if (!userId) {
      return
    }
    this.userStates.set(userId, state)
  }

  private clearUserState(ctx: any) {
    const userId = ctx.from?.id
    if (!userId) {
      return
    }
    this.userStates.delete(userId)
  }
}
