import type { Meta, StoryObj } from '@storybook/react-vite'
import { UIExample } from './UIExample'

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
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialog',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogAction',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogCancel',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogContent',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogDescription',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogFooter',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogHeader',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogMedia',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogOverlay',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogPortal',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogTitle',
        'workers/app/src/components/ui/alert-dialog.tsx#AlertDialogTrigger'
      ]
    }
  }
}
export const Pagination: Story = {
  args: { family: 'pagination' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/pagination.tsx#Pagination',
        'workers/app/src/components/ui/pagination.tsx#PaginationContent',
        'workers/app/src/components/ui/pagination.tsx#PaginationLink',
        'workers/app/src/components/ui/pagination.tsx#PaginationItem',
        'workers/app/src/components/ui/pagination.tsx#PaginationPrevious',
        'workers/app/src/components/ui/pagination.tsx#PaginationNext',
        'workers/app/src/components/ui/pagination.tsx#PaginationEllipsis'
      ]
    }
  }
}
export const Tabs: Story = {
  args: { family: 'tabs' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/tabs.tsx#Tabs',
        'workers/app/src/components/ui/tabs.tsx#TabsList',
        'workers/app/src/components/ui/tabs.tsx#TabsTrigger',
        'workers/app/src/components/ui/tabs.tsx#TabsContent'
      ]
    }
  }
}
export const Popover: Story = {
  args: { family: 'popover' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/popover.tsx#Popover',
        'workers/app/src/components/ui/popover.tsx#PopoverTrigger',
        'workers/app/src/components/ui/popover.tsx#PopoverContent',
        'workers/app/src/components/ui/popover.tsx#PopoverAnchor',
        'workers/app/src/components/ui/popover.tsx#PopoverHeader',
        'workers/app/src/components/ui/popover.tsx#PopoverTitle',
        'workers/app/src/components/ui/popover.tsx#PopoverDescription'
      ]
    }
  }
}
export const Progress: Story = {
  args: { family: 'progress' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/progress.tsx#Progress'] } }
}
export const Sheet: Story = {
  args: { family: 'sheet' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/sheet.tsx#Sheet',
        'workers/app/src/components/ui/sheet.tsx#SheetTrigger',
        'workers/app/src/components/ui/sheet.tsx#SheetClose',
        'workers/app/src/components/ui/sheet.tsx#SheetContent',
        'workers/app/src/components/ui/sheet.tsx#SheetHeader',
        'workers/app/src/components/ui/sheet.tsx#SheetFooter',
        'workers/app/src/components/ui/sheet.tsx#SheetTitle',
        'workers/app/src/components/ui/sheet.tsx#SheetDescription'
      ]
    }
  }
}
export const Label: Story = {
  args: { family: 'label' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/label.tsx#Label'] } }
}
export const Sonner: Story = {
  args: { family: 'sonner' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/sonner.tsx#Toaster'] } }
}
export const Accordion: Story = {
  args: { family: 'accordion' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/accordion.tsx#Accordion',
        'workers/app/src/components/ui/accordion.tsx#AccordionItem',
        'workers/app/src/components/ui/accordion.tsx#AccordionTrigger',
        'workers/app/src/components/ui/accordion.tsx#AccordionContent'
      ]
    }
  }
}
export const Drawer: Story = {
  args: { family: 'drawer' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/drawer.tsx#Drawer',
        'workers/app/src/components/ui/drawer.tsx#DrawerPortal',
        'workers/app/src/components/ui/drawer.tsx#DrawerOverlay',
        'workers/app/src/components/ui/drawer.tsx#DrawerTrigger',
        'workers/app/src/components/ui/drawer.tsx#DrawerClose',
        'workers/app/src/components/ui/drawer.tsx#DrawerContent',
        'workers/app/src/components/ui/drawer.tsx#DrawerHeader',
        'workers/app/src/components/ui/drawer.tsx#DrawerFooter',
        'workers/app/src/components/ui/drawer.tsx#DrawerTitle',
        'workers/app/src/components/ui/drawer.tsx#DrawerDescription'
      ]
    }
  }
}
export const Tooltip: Story = {
  args: { family: 'tooltip' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/tooltip.tsx#Tooltip',
        'workers/app/src/components/ui/tooltip.tsx#TooltipTrigger',
        'workers/app/src/components/ui/tooltip.tsx#TooltipContent',
        'workers/app/src/components/ui/tooltip.tsx#TooltipProvider'
      ]
    }
  }
}
export const Alert: Story = {
  args: { family: 'alert' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/alert.tsx#Alert',
        'workers/app/src/components/ui/alert.tsx#AlertTitle',
        'workers/app/src/components/ui/alert.tsx#AlertDescription'
      ]
    }
  }
}
export const Breadcrumb: Story = {
  args: { family: 'breadcrumb' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/breadcrumb.tsx#Breadcrumb',
        'workers/app/src/components/ui/breadcrumb.tsx#BreadcrumbList',
        'workers/app/src/components/ui/breadcrumb.tsx#BreadcrumbItem',
        'workers/app/src/components/ui/breadcrumb.tsx#BreadcrumbLink',
        'workers/app/src/components/ui/breadcrumb.tsx#BreadcrumbPage',
        'workers/app/src/components/ui/breadcrumb.tsx#BreadcrumbSeparator',
        'workers/app/src/components/ui/breadcrumb.tsx#BreadcrumbEllipsis'
      ]
    }
  }
}
export const Command: Story = {
  args: { family: 'command' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/command.tsx#Command',
        'workers/app/src/components/ui/command.tsx#CommandDialog',
        'workers/app/src/components/ui/command.tsx#CommandInput',
        'workers/app/src/components/ui/command.tsx#CommandList',
        'workers/app/src/components/ui/command.tsx#CommandEmpty',
        'workers/app/src/components/ui/command.tsx#CommandGroup',
        'workers/app/src/components/ui/command.tsx#CommandItem',
        'workers/app/src/components/ui/command.tsx#CommandShortcut',
        'workers/app/src/components/ui/command.tsx#CommandSeparator'
      ]
    }
  }
}
export const Avatar: Story = {
  args: { family: 'avatar' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/avatar.tsx#Avatar',
        'workers/app/src/components/ui/avatar.tsx#AvatarImage',
        'workers/app/src/components/ui/avatar.tsx#AvatarFallback',
        'workers/app/src/components/ui/avatar.tsx#AvatarBadge',
        'workers/app/src/components/ui/avatar.tsx#AvatarGroup',
        'workers/app/src/components/ui/avatar.tsx#AvatarGroupCount'
      ]
    }
  }
}
export const Dialog: Story = {
  args: { family: 'dialog' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/dialog.tsx#Dialog',
        'workers/app/src/components/ui/dialog.tsx#DialogClose',
        'workers/app/src/components/ui/dialog.tsx#DialogContent',
        'workers/app/src/components/ui/dialog.tsx#DialogDescription',
        'workers/app/src/components/ui/dialog.tsx#DialogFooter',
        'workers/app/src/components/ui/dialog.tsx#DialogHeader',
        'workers/app/src/components/ui/dialog.tsx#DialogOverlay',
        'workers/app/src/components/ui/dialog.tsx#DialogPortal',
        'workers/app/src/components/ui/dialog.tsx#DialogTitle',
        'workers/app/src/components/ui/dialog.tsx#DialogTrigger'
      ]
    }
  }
}
export const Badge: Story = {
  args: { family: 'badge' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/badge.tsx#Badge'] } }
}
export const Separator: Story = {
  args: { family: 'separator' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/separator.tsx#Separator'] } }
}
export const Button: Story = {
  args: { family: 'button' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/button.tsx#Button'] } }
}
export const Toggle: Story = {
  args: { family: 'toggle' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/toggle.tsx#Toggle'] } }
}
export const Checkbox: Story = {
  args: { family: 'checkbox' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/checkbox.tsx#Checkbox'] } }
}
export const Select: Story = {
  args: { family: 'select' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/select.tsx#Select',
        'workers/app/src/components/ui/select.tsx#SelectContent',
        'workers/app/src/components/ui/select.tsx#SelectGroup',
        'workers/app/src/components/ui/select.tsx#SelectItem',
        'workers/app/src/components/ui/select.tsx#SelectLabel',
        'workers/app/src/components/ui/select.tsx#SelectScrollDownButton',
        'workers/app/src/components/ui/select.tsx#SelectScrollUpButton',
        'workers/app/src/components/ui/select.tsx#SelectSeparator',
        'workers/app/src/components/ui/select.tsx#SelectTrigger',
        'workers/app/src/components/ui/select.tsx#SelectValue'
      ]
    }
  }
}
export const Textarea: Story = {
  args: { family: 'textarea' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/textarea.tsx#Textarea'] } }
}
export const Input: Story = {
  args: { family: 'input' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/input.tsx#Input'] } }
}
export const Skeleton: Story = {
  args: { family: 'skeleton' },
  parameters: { catalogue: { sources: ['workers/app/src/components/ui/skeleton.tsx#Skeleton'] } }
}
export const Form: Story = {
  args: { family: 'form' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/form.tsx#Form',
        'workers/app/src/components/ui/form.tsx#FormItem',
        'workers/app/src/components/ui/form.tsx#FormLabel',
        'workers/app/src/components/ui/form.tsx#FormControl',
        'workers/app/src/components/ui/form.tsx#FormDescription',
        'workers/app/src/components/ui/form.tsx#FormMessage',
        'workers/app/src/components/ui/form.tsx#FormField'
      ]
    }
  }
}
export const Carousel: Story = {
  args: { family: 'carousel' },
  parameters: {
    catalogue: {
      sources: [
        'workers/app/src/components/ui/carousel.tsx#Carousel',
        'workers/app/src/components/ui/carousel.tsx#CarouselContent',
        'workers/app/src/components/ui/carousel.tsx#CarouselItem',
        'workers/app/src/components/ui/carousel.tsx#CarouselPrevious',
        'workers/app/src/components/ui/carousel.tsx#CarouselNext'
      ]
    }
  }
}
