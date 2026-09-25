// file là trang productlist của giao diện người dùng.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { productApi } from '../api/services';
import type { Product } from '../api/types';
import { ProductCard } from '../components/ProductCard';

export function ProductListPage() {
  const [params] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const category = params.get('category');
  useEffect(() => {
    productApi.list({ keyword: params.get('keyword') || undefined, category: category || undefined })
      .then(r => setProducts(r.data)).catch(() => setProducts([]));
  }, [params, category]);

  return <>
    <section className="page-hero compact">
      <span className="eyebrow dark">Shop gia dụng</span>
      <h1>{params.get('keyword') ? <>Kết quả cho “{params.get('keyword')}”</> : category || 'Tất cả sản phẩm'}</h1>
      <p>Lọc nhanh nồi cơm điện, máy xay, máy hút bụi và thiết bị gia dụng chính hãng.</p>
    </section>
    <section className="shop-layout section">
      <div className="shop-content">
        <div className="shop-toolbar reveal">
          <span>Tìm thấy <strong>{products.length}</strong> sản phẩm</span>
          <select id="sortSelect" defaultValue="" onChange={e => {
            const v = e.target.value; const copy = [...products];
            if (v === 'price-asc') copy.sort((a,b)=>a.price-b.price);
            if (v === 'price-desc') copy.sort((a,b)=>b.price-a.price);
            if (v === 'name') copy.sort((a,b)=>a.name.localeCompare(b.name,'vi'));
            setProducts(copy);
          }}>
            <option value="">Sắp xếp mặc định</option><option value="price-asc">Giá tăng dần</option><option value="price-desc">Giá giảm dần</option><option value="name">Tên A-Z</option>
          </select>
        </div>
        {products.length ? <div className="product-grid" id="productsGrid">{products.map((p,i)=><ProductCard key={p.id} product={p} index={i}/>)}</div> :
          <div className="empty-state reveal"><i className="fa-solid fa-magnifying-glass" /><h2>Không tìm thấy sản phẩm</h2><p>Thử từ khóa khác hoặc quay về toàn bộ sản phẩm.</p><Link to="/products" className="btn btn-primary">Xem tất cả</Link></div>}
      </div>
    </section>
  </>;
}
