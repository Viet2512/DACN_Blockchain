import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,expect,it,vi} from 'vitest';
import CreateLotPage from './CreateLotPage';
import {adminService,lotService} from '../../services/api';
vi.mock('../../context/AuthContext',()=>({useAuth:()=>({user:{username:'farmer',regionCode:'TG-001'}})}));
vi.mock('../../services/api',async original=>{
 const actual=await original<typeof import('../../services/api')>();
 return {...actual,lotService:{...actual.lotService,list:vi.fn(),create:vi.fn()},adminService:{...actual.adminService,organizations:vi.fn()}};
});
beforeEach(()=>{
 vi.clearAllMocks();
 vi.mocked(lotService.list).mockResolvedValue([{lotId:'EXISTING',productName:'Xoài cát Hòa Lộc',origin:'Vườn Cái Bè',harvestDate:'2026-11-01',status:'HARVESTED',currentHolder:'farmer',regionCode:'TG-001',createdAt:'2026-11-01',lastEventId:'harvest',eventCount:2}]);
 vi.mocked(adminService.organizations).mockResolvedValue([]);
});
it('offers existing values and a valid suggested ID without filling business facts or submitting',async()=>{
 render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CreateLotPage/></QueryClientProvider></MemoryRouter>);
 await waitFor(()=>expect(document.querySelector('#create-productName-suggestions option[value="Xoài cát Hòa Lộc"]')).not.toBeNull());
 expect(document.querySelector('#create-origin-suggestions option[value="Vườn Cái Bè"]')).not.toBeNull();
 fireEvent.change(screen.getByLabelText('Tên sản phẩm'),{target:{value:'Sản phẩm người dùng nhập'}});
 fireEvent.click(screen.getByRole('button',{name:'Gợi ý mã lô'}));
 expect((screen.getByLabelText('Mã lô') as HTMLInputElement).value).toMatch(/^LOT-\d{8}-[A-F0-9]{8}$/);
 expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Sản phẩm người dùng nhập');
 expect(screen.getByLabelText('Ngày thu hoạch theo hồ sơ lô')).toHaveValue('');
 expect(screen.getByLabelText('Nguồn gốc')).toHaveValue('');
 expect(lotService.create).not.toHaveBeenCalled();
 expect(await screen.findAllByText(/Chưa có đơn vị đang hoạt động/)).toHaveLength(2);
});

it('uses a valid native HTML v-pattern and rejects accented or spaced lot IDs',()=>{
 render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CreateLotPage/></QueryClientProvider></MemoryRouter>);
 const input=screen.getByLabelText('Mã lô') as HTMLInputElement;
 const pattern=new RegExp(`^(?:${input.pattern})$`,'v');
 expect(pattern.test('LOT-QA_01')).toBe(true);expect(pattern.test('LÔ-01')).toBe(false);expect(pattern.test('LOT 01')).toBe(false);
});
