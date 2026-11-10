import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {afterEach, expect, it, vi} from 'vitest';
import LotRecords from './LotRecords';
import {api} from '../../services/api';
import type {Lot, User} from '../../types';
const lot: Lot = {lotId: 'QA',ownerOrganizationId:'farm',currentHolderOrganizationId:'transport-org', productName: 'Xoài', origin: 'TG', harvestDate: '2026-11-06', status: 'IN_TRANSIT', currentHolder: 't1', regionCode: 'QA', createdAt: '2026-11-06', lastEventId: 'event', eventCount: 5};
const transporter: User = {username: 't1',userId:'t1-user',organizationId:'transport-org',permissions:['HANDOVER_CONFIRM','LOT_RECALL'], role: 'TRANSPORTER', actorId: 't1', orgMsp: 'Org2MSP', regionCode: 'QA'};
afterEach(() => vi.restoreAllMocks());
function mount(user: User) {return render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}})}><LotRecords lot={lot} user={user}/></QueryClientProvider>);}
it('submits transport readings including zero, identifies records as off-chain', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({data: {items: [], total: 0}});
  const post = vi.spyOn(api, 'post').mockResolvedValue({data: {}});
  mount(transporter);
  fireEvent.change(screen.getByLabelText('Loại hồ sơ'), {target: {value: 'transport-logs'}});
  fireEvent.change(await screen.findByLabelText('Thời điểm'), {target: {value: '2026-11-06T10:30'}});
  fireEvent.change(screen.getByLabelText('Vị trí'), {target: {value: 'QA'}});
  fireEvent.change(screen.getByLabelText('Nhiệt độ (°C)'), {target: {value: '0'}});
  fireEvent.change(screen.getByLabelText('Độ ẩm (%)'), {target: {value: '0'}});
  fireEvent.click(screen.getByRole('button', {name: 'Lưu hồ sơ'}));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/lots/QA/transport-logs', expect.objectContaining({location: 'QA', temperature: 0, humidity: 0})));
  expect(await screen.findByRole('status')).toHaveTextContent('ngoài blockchain');
});
it('admin can inspect logs but cannot create business records', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({data: {items: [], total: 0}});
  mount({...transporter, role: 'ADMIN'});
  await screen.findByText('Chưa có dữ liệu phù hợp.');
  expect(screen.queryByRole('button', {name: 'Lưu hồ sơ'})).not.toBeInTheDocument();
});

it('offers cultivation examples as suggestions without recording a fact automatically',async()=>{
 vi.spyOn(api,'get').mockResolvedValue({data:{items:[],total:0}});
 const post=vi.spyOn(api,'post').mockResolvedValue({data:{}});
 mount({...transporter,role:'FARMER',organizationId:'farm',permissions:['LOT_HARVEST']});
 const activity=await screen.findByLabelText('Hoạt động canh tác');
 expect(activity).toHaveValue('');
 expect(activity).toHaveAttribute('list','record-activity-suggestions');
 expect(document.querySelector('#record-activity-suggestions option[value="Tưới nước"]')).not.toBeNull();
 expect(screen.getByLabelText('Thời điểm')).toHaveValue('');
 expect(post).not.toHaveBeenCalled();
});
