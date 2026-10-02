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
        'src/components/ui/alert-dialog.tsx#AlertDialog',
        'src/components/ui/alert-dialog.tsx#AlertDialogAction',
        'src/components/ui/alert-dialog.tsx#AlertDialogCancel',
        'src/components/ui/alert-dialog.tsx#AlertDialogContent',
        'src/components/ui/alert-dialog.tsx#AlertDialogDescription',
        'src/components/ui/alert-dialog.tsx#AlertDialogFooter',
        'src/components/ui/alert-dialog.tsx#AlertDialogHeader',
        'src/components/ui/alert-dialog.tsx#AlertDialogMedia',
        'src/components/ui/alert-dialog.tsx#AlertDialogOverlay',
        'src/components/ui/alert-dialog.tsx#AlertDialogPortal',
        'src/components/ui/alert-dialog.tsx#AlertDialogTitle',
        'src/components/ui/alert-dialog.tsx#AlertDialogTrigger'
      ]
    }
  }
}
export const Pagination: Story = {
  args: { family: 'pagination' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/pagination.tsx#Pagination',
        'src/components/ui/pagination.tsx#PaginationContent',
        'src/components/ui/pagination.tsx#PaginationLink',
        'src/components/ui/pagination.tsx#PaginationItem',
        'src/components/ui/pagination.tsx#PaginationPrevious',
        'src/components/ui/pagination.tsx#PaginationNext',
        'src/components/ui/pagination.tsx#PaginationEllipsis'
      ]
    }
  }
}
export const Tabs: Story = {
  args: { family: 'tabs' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/tabs.tsx#Tabs',
        'src/components/ui/tabs.tsx#TabsList',
        'src/components/ui/tabs.tsx#TabsTrigger',
        'src/components/ui/tabs.tsx#TabsContent'
      ]
    }
  }
}
export const Popover: Story = {
  args: { family: 'popover' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/popover.tsx#Popover',
        'src/components/ui/popover.tsx#PopoverTrigger',
        'src/components/ui/popover.tsx#PopoverContent',
        'src/components/ui/popover.tsx#PopoverAnchor',
        'src/components/ui/popover.tsx#PopoverHeader',
        'src/components/ui/popover.tsx#PopoverTitle',
        'src/components/ui/popover.tsx#PopoverDescription'
      ]
    }
  }
}
export const Progress: Story = {
  args: { family: 'progress' },
  parameters: { catalogue: { sources: ['src/components/ui/progress.tsx#Progress'] } }
}
export const Sheet: Story = {
  args: { family: 'sheet' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/sheet.tsx#Sheet',
        'src/components/ui/sheet.tsx#SheetTrigger',
        'src/components/ui/sheet.tsx#SheetClose',
        'src/components/ui/sheet.tsx#SheetContent',
        'src/components/ui/sheet.tsx#SheetHeader',
        'src/components/ui/sheet.tsx#SheetFooter',
        'src/components/ui/sheet.tsx#SheetTitle',
        'src/components/ui/sheet.tsx#SheetDescription'
      ]
    }
  }
}
export const Label: Story = {
  args: { family: 'label' },
  parameters: { catalogue: { sources: ['src/components/ui/label.tsx#Label'] } }
}
export const Sonner: Story = {
  args: { family: 'sonner' },
  parameters: { catalogue: { sources: ['src/components/ui/sonner.tsx#Toaster'] } }
}
export const Accordion: Story = {
  args: { family: 'accordion' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/accordion.tsx#Accordion',
        'src/components/ui/accordion.tsx#AccordionItem',
        'src/components/ui/accordion.tsx#AccordionTrigger',
        'src/components/ui/accordion.tsx#AccordionContent'
      ]
    }
  }
}
export const Drawer: Story = {
  args: { family: 'drawer' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/drawer.tsx#Drawer',
        'src/components/ui/drawer.tsx#DrawerPortal',
        'src/components/ui/drawer.tsx#DrawerOverlay',
        'src/components/ui/drawer.tsx#DrawerTrigger',
        'src/components/ui/drawer.tsx#DrawerClose',
        'src/components/ui/drawer.tsx#DrawerContent',
        'src/components/ui/drawer.tsx#DrawerHeader',
        'src/components/ui/drawer.tsx#DrawerFooter',
        'src/components/ui/drawer.tsx#DrawerTitle',
        'src/components/ui/drawer.tsx#DrawerDescription'
      ]
    }
  }
}
export const Tooltip: Story = {
  args: { family: 'tooltip' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/tooltip.tsx#Tooltip',
        'src/components/ui/tooltip.tsx#TooltipTrigger',
        'src/components/ui/tooltip.tsx#TooltipContent',
        'src/components/ui/tooltip.tsx#TooltipProvider'
      ]
    }
  }
}
export const Alert: Story = {
  args: { family: 'alert' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/alert.tsx#Alert',
        'src/components/ui/alert.tsx#AlertTitle',
        'src/components/ui/alert.tsx#AlertDescription'
      ]
    }
  }
}
export const Breadcrumb: Story = {
  args: { family: 'breadcrumb' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/breadcrumb.tsx#Breadcrumb',
        'src/components/ui/breadcrumb.tsx#BreadcrumbList',
        'src/components/ui/breadcrumb.tsx#BreadcrumbItem',
        'src/components/ui/breadcrumb.tsx#BreadcrumbLink',
        'src/components/ui/breadcrumb.tsx#BreadcrumbPage',
        'src/components/ui/breadcrumb.tsx#BreadcrumbSeparator',
        'src/components/ui/breadcrumb.tsx#BreadcrumbEllipsis'
      ]
    }
  }
}
export const Command: Story = {
  args: { family: 'command' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/command.tsx#Command',
        'src/components/ui/command.tsx#CommandDialog',
        'src/components/ui/command.tsx#CommandInput',
        'src/components/ui/command.tsx#CommandList',
        'src/components/ui/command.tsx#CommandEmpty',
        'src/components/ui/command.tsx#CommandGroup',
        'src/components/ui/command.tsx#CommandItem',
        'src/components/ui/command.tsx#CommandShortcut',
        'src/components/ui/command.tsx#CommandSeparator'
      ]
    }
  }
}
export const Avatar: Story = {
  args: { family: 'avatar' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/avatar.tsx#Avatar',
        'src/components/ui/avatar.tsx#AvatarImage',
        'src/components/ui/avatar.tsx#AvatarFallback',
        'src/components/ui/avatar.tsx#AvatarBadge',
        'src/components/ui/avatar.tsx#AvatarGroup',
        'src/components/ui/avatar.tsx#AvatarGroupCount'
      ]
    }
  }
}
export const Dialog: Story = {
  args: { family: 'dialog' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/dialog.tsx#Dialog',
        'src/components/ui/dialog.tsx#DialogClose',
        'src/components/ui/dialog.tsx#DialogContent',
        'src/components/ui/dialog.tsx#DialogDescription',
        'src/components/ui/dialog.tsx#DialogFooter',
        'src/components/ui/dialog.tsx#DialogHeader',
        'src/components/ui/dialog.tsx#DialogOverlay',
        'src/components/ui/dialog.tsx#DialogPortal',
        'src/components/ui/dialog.tsx#DialogTitle',
        'src/components/ui/dialog.tsx#DialogTrigger'
      ]
    }
  }
}
export const Badge: Story = {
  args: { family: 'badge' },
  parameters: { catalogue: { sources: ['src/components/ui/badge.tsx#Badge'] } }
}
export const Separator: Story = {
  args: { family: 'separator' },
  parameters: { catalogue: { sources: ['src/components/ui/separator.tsx#Separator'] } }
}
export const Button: Story = {
  args: { family: 'button' },
  parameters: { catalogue: { sources: ['src/components/ui/button.tsx#Button'] } }
}
export const Toggle: Story = {
  args: { family: 'toggle' },
  parameters: { catalogue: { sources: ['src/components/ui/toggle.tsx#Toggle'] } }
}
export const Checkbox: Story = {
  args: { family: 'checkbox' },
  parameters: { catalogue: { sources: ['src/components/ui/checkbox.tsx#Checkbox'] } }
}
export const Select: Story = {
  args: { family: 'select' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/select.tsx#Select',
        'src/components/ui/select.tsx#SelectContent',
        'src/components/ui/select.tsx#SelectGroup',
        'src/components/ui/select.tsx#SelectItem',
        'src/components/ui/select.tsx#SelectLabel',
        'src/components/ui/select.tsx#SelectScrollDownButton',
        'src/components/ui/select.tsx#SelectScrollUpButton',
        'src/components/ui/select.tsx#SelectSeparator',
        'src/components/ui/select.tsx#SelectTrigger',
        'src/components/ui/select.tsx#SelectValue'
      ]
    }
  }
}
export const Textarea: Story = {
  args: { family: 'textarea' },
  parameters: { catalogue: { sources: ['src/components/ui/textarea.tsx#Textarea'] } }
}
export const Input: Story = {
  args: { family: 'input' },
  parameters: { catalogue: { sources: ['src/components/ui/input.tsx#Input'] } }
}
export const Skeleton: Story = {
  args: { family: 'skeleton' },
  parameters: { catalogue: { sources: ['src/components/ui/skeleton.tsx#Skeleton'] } }
}
export const Form: Story = {
  args: { family: 'form' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/form.tsx#Form',
        'src/components/ui/form.tsx#FormItem',
        'src/components/ui/form.tsx#FormLabel',
        'src/components/ui/form.tsx#FormControl',
        'src/components/ui/form.tsx#FormDescription',
        'src/components/ui/form.tsx#FormMessage',
        'src/components/ui/form.tsx#FormField'
      ]
    }
  }
}
export const Carousel: Story = {
  args: { family: 'carousel' },
  parameters: {
    catalogue: {
      sources: [
        'src/components/ui/carousel.tsx#Carousel',
        'src/components/ui/carousel.tsx#CarouselContent',
        'src/components/ui/carousel.tsx#CarouselItem',
        'src/components/ui/carousel.tsx#CarouselPrevious',
        'src/components/ui/carousel.tsx#CarouselNext'
      ]
    }
  }
}
