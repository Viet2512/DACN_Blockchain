import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,expect,it,vi} from 'vitest';
import LotDetailPage from './LotDetailPage';
import {adminService,lotService} from '../../services/api';
import type {User,Lot} from '../../types';
let user: User;
vi.mock('../../context/AuthContext',()=>({useAuth:()=>({user})}));
vi.mock('./LotRecords',()=>({default:()=>null}));
vi.mock('../../services/api',async original=>{
 const actual=await original<typeof import('../../services/api')>();
 return {...actual,lotService:{...actual.lotService,get:vi.fn(),validate:vi.fn(),reconcile:vi.fn()},adminService:{...actual.adminService,organizations:vi.fn()}};
});
const lot:Lot={lotId:'REAL-ID',schemaVersion:4,source:'FABRIC',productName:'Xoài',origin:'Vườn',harvestDate:'2026-11-01',status:'READY_FOR_SALE',currentHolder:'holder-user',currentHolderOrganizationId:'distributor',ownerOrganizationId:'farm',regionCode:'TG',createdAt:'2026-11-01',lastEventId:'event',eventCount:1,events:[{eventId:'event',eventType:'CTE_CREATE',actorRole:'FARMER',businessOrganizationId:'farm',timestamp:'2026-11-01',location:'Vườn',previousEventId:null,dataHash:'hash'}]};
beforeEach(()=>{
 vi.clearAllMocks();
 user={username:'viewer',role:'ADMIN',actorId:null,orgMsp:null,regionCode:null,permissions:['LOT_READ','TRACE_HISTORY_READ','ORGANIZATION_READ']};
 vi.mocked(lotService.get).mockResolvedValue(lot);
 vi.mocked(adminService.organizations).mockResolvedValue([{organizationId:'farm',name:'Nông trại A',mspId:'Org1MSP',organizationType:'FARM',status:'ACTIVE'}]);
});
function mount(){return render(<MemoryRouter initialEntries={['/lots/REAL-ID']}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Routes><Route path="/lots/:lotId" element={<LotDetailPage/>}/></Routes></QueryClientProvider></MemoryRouter>);}
it('does not offer validation or reconciliation without the server permission',async()=>{
 mount();await screen.findByRole('heading',{name:'Xoài'});
 expect(screen.queryByRole('button',{name:'Kiểm tra tính hợp lệ'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Đối chiếu & đồng bộ bản lưu'})).not.toBeInTheDocument();
 expect(lotService.validate).not.toHaveBeenCalled();expect(lotService.reconcile).not.toHaveBeenCalled();
 await waitFor(()=>expect(screen.getAllByText('Nông trại A')).toHaveLength(2));
});
it('shows a failed verification as invalid and keeps reconciliation separate',async()=>{
 user={...user,permissions:[...user.permissions!,'TRACE_VALIDATE']};
 vi.mocked(lotService.validate).mockResolvedValue({valid:false,checkedEvents:1,source:'FABRIC',scope:'IESH_V4',invalidHashes:['event']});
 mount();fireEvent.click(await screen.findByRole('button',{name:'Kiểm tra tính hợp lệ'}));
 expect(await screen.findByRole('heading',{name:'Phát hiện lịch sử không hợp lệ'})).toBeInTheDocument();
 expect(lotService.validate).toHaveBeenCalledWith('REAL-ID');expect(lotService.reconcile).not.toHaveBeenCalled();
});

it('offers a neutral event chooser when transport recording and handover are both available',async()=>{
 user={username:'driver',role:'TRANSPORTER',organizationId:'driver',actorId:'driver',orgMsp:'Org2MSP',regionCode:'TG',permissions:['LOT_READ','ORGANIZATION_READ','HANDOVER_CREATE','TRANSPORT_RECORD','LOT_RECALL']};
 vi.mocked(lotService.get).mockResolvedValue({...lot,status:'IN_TRANSIT',currentHolderOrganizationId:'driver'});
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 mount();fireEvent.click(await screen.findByRole('button',{name:'Ghi nhận sự kiện'}));
 expect(await screen.findByRole('option',{name:'Ghi nhận vận chuyển'})).toBeInTheDocument();
 expect(screen.getByRole('option',{name:'Giao sang phân phối'})).toBeInTheDocument();
});
