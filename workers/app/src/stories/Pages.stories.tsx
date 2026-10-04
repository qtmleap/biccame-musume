import type { Meta, StoryObj } from '@storybook/react-vite'
import { PageExample } from './PageExample'

const meta = {
  title: 'Pages/Production',
  component: PageExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true, access: true } }
} satisfies Meta<typeof PageExample>
export default meta
type Story = StoryObj<typeof meta>
export const Home: Story = {
  args: { path: '/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/index.tsx#Route'] } }
}
export const Rootlayout: Story = {
  args: { path: '/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/__root.tsx#Route'] } }
}
export const Ranking: Story = {
  args: { path: '/ranking/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/ranking/index.tsx#Route'] } }
}
export const Contact: Story = {
  args: { path: '/contact/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/contact/index.tsx#Route'] } }
}
export const Calendar: Story = {
  args: { path: '/calendar/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/calendar/index.tsx#Route'] } }
}
export const Route: Story = {
  args: { path: '/route/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/route/index.tsx#Route'] } }
}
export const Location: Story = {
  args: { path: '/location/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/location/index.tsx#Route'] } }
}
export const Admin: Story = {
  args: { path: '/admin/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/index.tsx#Route'] } }
}
export const Admincomments: Story = {
  args: { path: '/admin/comments/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/comments/index.tsx#Route'] } }
}
export const Admintwitter: Story = {
  args: { path: '/admin/twitter/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/twitter/index.tsx#Route'] } }
}
export const Adminusers: Story = {
  args: { path: '/admin/users/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/users/index.tsx#Route'] } }
}
export const AdmineventGroups: Story = {
  args: { path: '/admin/event-groups/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/event-groups/index.tsx#Route'] } }
}
export const AdmineventGroupsuuidedit: Story = {
  args: { path: '/admin/event-groups/00000000-0000-4000-8000-000000000041/edit/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/event-groups/$uuid/edit/index.tsx#Route'] } }
}
export const AdmineventGroupsnew: Story = {
  args: { path: '/admin/event-groups/new/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/event-groups/new/index.tsx#Route'] } }
}
export const Adminevents: Story = {
  args: { path: '/admin/events/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/events/index.tsx#Route'] } }
}
export const Admineventsuuid: Story = {
  args: { path: '/admin/events/00000000-0000-4000-8000-000000000001/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/events/$uuid/index.tsx#Route'] } }
}
export const Admineventsuuidedit: Story = {
  args: { path: '/admin/events/00000000-0000-4000-8000-000000000001/edit/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/events/$uuid/edit/index.tsx#Route'] } }
}
export const Admineventsnew: Story = {
  args: { path: '/admin/events/new/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/events/new/index.tsx#Route'] } }
}
export const Adminbadges: Story = {
  args: { path: '/admin/badges/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/badges/index.tsx#Route'] } }
}
export const Adminbadgesranking: Story = {
  args: { path: '/admin/badges/ranking/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin/badges/ranking/index.tsx#Route'] } }
}
export const About: Story = {
  args: { path: '/about/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/about/index.tsx#Route'] } }
}
export const Mecompleted: Story = {
  args: { path: '/me/completed/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/me/completed/index.tsx#Route'] } }
}
export const Me: Story = {
  args: { path: '/me/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/me/index.tsx#Route'] } }
}
export const Mevisited: Story = {
  args: { path: '/me/visited/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/me/visited/index.tsx#Route'] } }
}
export const Mefavorites: Story = {
  args: { path: '/me/favorites/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/me/favorites/index.tsx#Route'] } }
}
export const Meinterested: Story = {
  args: { path: '/me/interested/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/me/interested/index.tsx#Route'] } }
}
export const Events: Story = {
  args: { path: '/events/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/events/index.tsx#Route'] } }
}
export const Eventsgroupid: Story = {
  args: { path: '/events/group/00000000-0000-4000-8000-000000000041/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/events/group/$id/index.tsx#Route'] } }
}
export const Eventsuuid: Story = {
  args: { path: '/events/00000000-0000-4000-8000-000000000001/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/events/$uuid/index.tsx#Route'] } }
}
export const Eventsgroups: Story = {
  args: { path: '/events/groups/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/events/groups/index.tsx#Route'] } }
}
export const Characters: Story = {
  args: { path: '/characters/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/characters/index.tsx#Route'] } }
}
export const Charactersid: Story = {
  args: { path: '/characters/abeno/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/characters/$id/index.tsx#Route'] } }
}
export const Badges: Story = {
  args: { path: '/badges/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/badges/index.tsx#Route'] } }
}
export const AdminLayout: Story = {
  args: { path: '/admin/' },
  parameters: { catalogue: { sources: ['workers/app/src/app/routes/admin.tsx#Route'] } }
}
export const Eventsempty: Story = {
  args: { path: '/events/' },
  parameters: { fixture: { authenticated: true, state: 'empty' } }
}
export const Eventsloading: Story = {
  args: { path: '/events/' },
  parameters: { fixture: { authenticated: true, state: 'loading' }, catalogue: { expectedLoading: true } }
}
export const Eventserror: Story = {
  args: { path: '/events/' },
  parameters: { fixture: { authenticated: true, state: 'error' }, catalogue: { expectedError: true } }
}
export const Adminsignedout: Story = {
  args: { path: '/admin/' },
  parameters: { fixture: { authenticated: false, access: false } }
}
