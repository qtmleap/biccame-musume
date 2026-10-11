import type { Meta, StoryObj } from '@storybook/react-vite'
import { UIExample } from '@/stories/UIExample'

const meta = {
  title: 'UI/Primitives',
  component: UIExample,
  tags: ['autodocs'],
  argTypes: { family: { table: { disable: true } }, disabled: { control: 'boolean' } }
} satisfies Meta<typeof UIExample>
export default meta
type Story = StoryObj<typeof meta>
export const AlertDialog: Story = {
  args: { family: 'alert-dialog' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialog',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogAction',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogCancel',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogContent',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogDescription',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogFooter',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogHeader',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogMedia',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogOverlay',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogPortal',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogTitle',
        'workers/web/src/app/components/ui/alert-dialog.tsx#AlertDialogTrigger'
      ]
    }
  }
}
export const Pagination: Story = {
  args: { family: 'pagination' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/pagination.tsx#Pagination',
        'workers/web/src/app/components/ui/pagination.tsx#PaginationContent',
        'workers/web/src/app/components/ui/pagination.tsx#PaginationLink',
        'workers/web/src/app/components/ui/pagination.tsx#PaginationItem',
        'workers/web/src/app/components/ui/pagination.tsx#PaginationPrevious',
        'workers/web/src/app/components/ui/pagination.tsx#PaginationNext',
        'workers/web/src/app/components/ui/pagination.tsx#PaginationEllipsis'
      ]
    }
  }
}
export const Tabs: Story = {
  args: { family: 'tabs' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/tabs.tsx#Tabs',
        'workers/web/src/app/components/ui/tabs.tsx#TabsList',
        'workers/web/src/app/components/ui/tabs.tsx#TabsTrigger',
        'workers/web/src/app/components/ui/tabs.tsx#TabsContent'
      ]
    }
  }
}
export const Popover: Story = {
  args: { family: 'popover' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/popover.tsx#Popover',
        'workers/web/src/app/components/ui/popover.tsx#PopoverTrigger',
        'workers/web/src/app/components/ui/popover.tsx#PopoverContent',
        'workers/web/src/app/components/ui/popover.tsx#PopoverAnchor',
        'workers/web/src/app/components/ui/popover.tsx#PopoverHeader',
        'workers/web/src/app/components/ui/popover.tsx#PopoverTitle',
        'workers/web/src/app/components/ui/popover.tsx#PopoverDescription'
      ]
    }
  }
}
export const Progress: Story = {
  args: { family: 'progress' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/progress.tsx#Progress'] } }
}
export const Sheet: Story = {
  args: { family: 'sheet' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/sheet.tsx#Sheet',
        'workers/web/src/app/components/ui/sheet.tsx#SheetTrigger',
        'workers/web/src/app/components/ui/sheet.tsx#SheetClose',
        'workers/web/src/app/components/ui/sheet.tsx#SheetContent',
        'workers/web/src/app/components/ui/sheet.tsx#SheetHeader',
        'workers/web/src/app/components/ui/sheet.tsx#SheetFooter',
        'workers/web/src/app/components/ui/sheet.tsx#SheetTitle',
        'workers/web/src/app/components/ui/sheet.tsx#SheetDescription'
      ]
    }
  }
}
export const Label: Story = {
  args: { family: 'label' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/label.tsx#Label'] } }
}
export const Sonner: Story = {
  args: { family: 'sonner' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/sonner.tsx#Toaster'] } }
}
export const Accordion: Story = {
  args: { family: 'accordion' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/accordion.tsx#Accordion',
        'workers/web/src/app/components/ui/accordion.tsx#AccordionItem',
        'workers/web/src/app/components/ui/accordion.tsx#AccordionTrigger',
        'workers/web/src/app/components/ui/accordion.tsx#AccordionContent'
      ]
    }
  }
}
export const Drawer: Story = {
  args: { family: 'drawer' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/drawer.tsx#Drawer',
        'workers/web/src/app/components/ui/drawer.tsx#DrawerPortal',
        'workers/web/src/app/components/ui/drawer.tsx#DrawerOverlay',
        'workers/web/src/app/components/ui/drawer.tsx#DrawerTrigger',
        'workers/web/src/app/components/ui/drawer.tsx#DrawerClose',
        'workers/web/src/app/components/ui/drawer.tsx#DrawerContent',
        'workers/web/src/app/components/ui/drawer.tsx#DrawerHeader',
        'workers/web/src/app/components/ui/drawer.tsx#DrawerFooter',
        'workers/web/src/app/components/ui/drawer.tsx#DrawerTitle',
        'workers/web/src/app/components/ui/drawer.tsx#DrawerDescription'
      ]
    }
  }
}
export const Tooltip: Story = {
  args: { family: 'tooltip' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/tooltip.tsx#Tooltip',
        'workers/web/src/app/components/ui/tooltip.tsx#TooltipTrigger',
        'workers/web/src/app/components/ui/tooltip.tsx#TooltipContent',
        'workers/web/src/app/components/ui/tooltip.tsx#TooltipProvider'
      ]
    }
  }
}
export const Alert: Story = {
  args: { family: 'alert' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/alert.tsx#Alert',
        'workers/web/src/app/components/ui/alert.tsx#AlertTitle',
        'workers/web/src/app/components/ui/alert.tsx#AlertDescription'
      ]
    }
  }
}
export const Breadcrumb: Story = {
  args: { family: 'breadcrumb' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/breadcrumb.tsx#Breadcrumb',
        'workers/web/src/app/components/ui/breadcrumb.tsx#BreadcrumbList',
        'workers/web/src/app/components/ui/breadcrumb.tsx#BreadcrumbItem',
        'workers/web/src/app/components/ui/breadcrumb.tsx#BreadcrumbLink',
        'workers/web/src/app/components/ui/breadcrumb.tsx#BreadcrumbPage',
        'workers/web/src/app/components/ui/breadcrumb.tsx#BreadcrumbSeparator',
        'workers/web/src/app/components/ui/breadcrumb.tsx#BreadcrumbEllipsis'
      ]
    }
  }
}
export const Command: Story = {
  args: { family: 'command' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/command.tsx#Command',
        'workers/web/src/app/components/ui/command.tsx#CommandDialog',
        'workers/web/src/app/components/ui/command.tsx#CommandInput',
        'workers/web/src/app/components/ui/command.tsx#CommandList',
        'workers/web/src/app/components/ui/command.tsx#CommandEmpty',
        'workers/web/src/app/components/ui/command.tsx#CommandGroup',
        'workers/web/src/app/components/ui/command.tsx#CommandItem',
        'workers/web/src/app/components/ui/command.tsx#CommandShortcut',
        'workers/web/src/app/components/ui/command.tsx#CommandSeparator'
      ]
    }
  }
}
export const Avatar: Story = {
  args: { family: 'avatar' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/avatar.tsx#Avatar',
        'workers/web/src/app/components/ui/avatar.tsx#AvatarImage',
        'workers/web/src/app/components/ui/avatar.tsx#AvatarFallback',
        'workers/web/src/app/components/ui/avatar.tsx#AvatarBadge',
        'workers/web/src/app/components/ui/avatar.tsx#AvatarGroup',
        'workers/web/src/app/components/ui/avatar.tsx#AvatarGroupCount'
      ]
    }
  }
}
export const Dialog: Story = {
  args: { family: 'dialog' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/dialog.tsx#Dialog',
        'workers/web/src/app/components/ui/dialog.tsx#DialogClose',
        'workers/web/src/app/components/ui/dialog.tsx#DialogContent',
        'workers/web/src/app/components/ui/dialog.tsx#DialogDescription',
        'workers/web/src/app/components/ui/dialog.tsx#DialogFooter',
        'workers/web/src/app/components/ui/dialog.tsx#DialogHeader',
        'workers/web/src/app/components/ui/dialog.tsx#DialogOverlay',
        'workers/web/src/app/components/ui/dialog.tsx#DialogPortal',
        'workers/web/src/app/components/ui/dialog.tsx#DialogTitle',
        'workers/web/src/app/components/ui/dialog.tsx#DialogTrigger'
      ]
    }
  }
}
export const Badge: Story = {
  args: { family: 'badge' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/badge.tsx#Badge'] } }
}
export const Separator: Story = {
  args: { family: 'separator' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/separator.tsx#Separator'] } }
}
export const Button: Story = {
  args: { family: 'button' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/button.tsx#Button'] } }
}
export const Toggle: Story = {
  args: { family: 'toggle' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/toggle.tsx#Toggle'] } }
}
export const Checkbox: Story = {
  args: { family: 'checkbox' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/checkbox.tsx#Checkbox'] } }
}
export const Select: Story = {
  args: { family: 'select' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/select.tsx#Select',
        'workers/web/src/app/components/ui/select.tsx#SelectContent',
        'workers/web/src/app/components/ui/select.tsx#SelectGroup',
        'workers/web/src/app/components/ui/select.tsx#SelectItem',
        'workers/web/src/app/components/ui/select.tsx#SelectLabel',
        'workers/web/src/app/components/ui/select.tsx#SelectScrollDownButton',
        'workers/web/src/app/components/ui/select.tsx#SelectScrollUpButton',
        'workers/web/src/app/components/ui/select.tsx#SelectSeparator',
        'workers/web/src/app/components/ui/select.tsx#SelectTrigger',
        'workers/web/src/app/components/ui/select.tsx#SelectValue'
      ]
    }
  }
}
export const Textarea: Story = {
  args: { family: 'textarea' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/textarea.tsx#Textarea'] } }
}
export const Input: Story = {
  args: { family: 'input' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/input.tsx#Input'] } }
}
export const Skeleton: Story = {
  args: { family: 'skeleton' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/ui/skeleton.tsx#Skeleton'] } }
}
export const Form: Story = {
  args: { family: 'form' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/form.tsx#Form',
        'workers/web/src/app/components/ui/form.tsx#FormItem',
        'workers/web/src/app/components/ui/form.tsx#FormLabel',
        'workers/web/src/app/components/ui/form.tsx#FormControl',
        'workers/web/src/app/components/ui/form.tsx#FormDescription',
        'workers/web/src/app/components/ui/form.tsx#FormMessage',
        'workers/web/src/app/components/ui/form.tsx#FormField'
      ]
    }
  }
}
export const Carousel: Story = {
  args: { family: 'carousel' },
  parameters: {
    catalogue: {
      sources: [
        'workers/web/src/app/components/ui/carousel.tsx#Carousel',
        'workers/web/src/app/components/ui/carousel.tsx#CarouselContent',
        'workers/web/src/app/components/ui/carousel.tsx#CarouselItem',
        'workers/web/src/app/components/ui/carousel.tsx#CarouselPrevious',
        'workers/web/src/app/components/ui/carousel.tsx#CarouselNext'
      ]
    }
  }
}
