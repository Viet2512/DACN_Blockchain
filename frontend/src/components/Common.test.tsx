import {render,screen,within} from '@testing-library/react';
import {expect,it} from 'vitest';
import {DataTable,EventTimeline} from './Common';
it('renders the full server page without a second client paginator',()=>{
 render(<DataTable paginate={false} rows={Array.from({length:20},(_,i)=>({id:i}))} rowKey={row=>row.id} columns={[{label:'Mã',render:row=>row.id}]}/>);
 expect(within(screen.getByRole('region',{name:'Bảng dữ liệu'})).getAllByRole('row')).toHaveLength(21);
 expect(screen.queryByRole('navigation',{name:'Phân trang'})).not.toBeInTheDocument();
});
it('orders timeline chronologically and keeps evidence folded',()=>{
 const first={eventId:'first',eventType:'CTE_CREATE' as const,actorRole:'FARMER' as const,timestamp:'2026-11-01T10:00:00Z',location:'Vườn',previousEventId:null,dataHash:'first-hash'};
 render(<EventTimeline events={[{...first,eventId:'second',eventType:'CTE_HARVEST',timestamp:'2026-11-02T10:00:00Z',previousEventId:'first',data:{quantity:0,temperature:0}},first]}/>);
 const articles=screen.getAllByRole('article');
 expect(articles[0]).toHaveTextContent('Khởi tạo lô');
 expect(articles[1]).toHaveTextContent('Thu hoạch');
 expect(articles[0].querySelector('details')).not.toHaveAttribute('open');
 expect(within(articles[1]).getAllByText('0')).toHaveLength(2);
});
